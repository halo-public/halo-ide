using System.Text;
using System.Text.Json;
using MiniCursor.Api.Models;

namespace MiniCursor.Api.Services;

public sealed class OpenAiRoundAccumulator
{
    private readonly Dictionary<int, ToolAcc> _tools = new();
    private ChatToolCallDto? _lastTool;

    public RoundApplyResult Apply(JsonElement root)
    {
        _lastTool = null;
        string? text = null;

        if (!root.TryGetProperty("choices", out var choices) ||
            choices.ValueKind != JsonValueKind.Array ||
            choices.GetArrayLength() == 0)
        {
            return default;
        }

        var choice = choices[0];
        var delta = choice.TryGetProperty("delta", out var deltaEl)
            ? deltaEl
            : choice.TryGetProperty("message", out var messageEl) ? messageEl : default;

        if (delta.ValueKind == JsonValueKind.Object)
        {
            if (delta.TryGetProperty("content", out var contentEl) &&
                contentEl.ValueKind == JsonValueKind.String)
            {
                text = contentEl.GetString();
            }

            if (delta.TryGetProperty("tool_calls", out var toolCalls) &&
                toolCalls.ValueKind == JsonValueKind.Array)
            {
                foreach (var call in toolCalls.EnumerateArray())
                    ApplyToolDelta(call);
            }
        }

        return new RoundApplyResult(
            string.IsNullOrEmpty(text) ? null : text,
            _lastTool);
    }

    public IReadOnlyList<ProviderToolCall> CompletedToolCalls() =>
        _tools
            .OrderBy(pair => pair.Key)
            .Select(pair => pair.Value.ToCall())
            .Where(call => !string.IsNullOrWhiteSpace(call.Name))
            .ToList();

    private void ApplyToolDelta(JsonElement call)
    {
        var index = 0;
        if (call.TryGetProperty("index", out var indexEl) && indexEl.TryGetInt32(out var parsed))
            index = parsed;

        if (!_tools.TryGetValue(index, out var acc))
        {
            acc = new ToolAcc();
            _tools[index] = acc;
        }

        if (call.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String)
        {
            var id = idEl.GetString();
            if (!string.IsNullOrWhiteSpace(id))
                acc.Id = id;
        }

        if (call.TryGetProperty("function", out var fn) && fn.ValueKind == JsonValueKind.Object)
        {
            if (fn.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String)
            {
                var name = nameEl.GetString();
                if (!string.IsNullOrWhiteSpace(name))
                    acc.Name = name;
            }

            if (fn.TryGetProperty("arguments", out var argsEl) && argsEl.ValueKind == JsonValueKind.String)
            {
                var chunk = argsEl.GetString();
                if (!string.IsNullOrEmpty(chunk))
                    acc.Arguments.Append(chunk);
            }
        }

        _lastTool = acc.ToDto("pending");
    }

    private sealed class ToolAcc
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Name { get; set; } = "tool";
        public StringBuilder Arguments { get; } = new();

        public ProviderToolCall ToCall() => new(Id, Name, Arguments.ToString());

        public ChatToolCallDto ToDto(string status)
        {
            var call = ToCall();
            return new ChatToolCallDto(call.Id, call.Name, status, Arguments: call.Arguments);
        }
    }
}

public sealed class ClaudeRoundAccumulator
{
    private readonly Dictionary<int, BlockAcc> _blocks = new();
    private ChatToolCallDto? _lastTool;

    public RoundApplyResult Apply(JsonElement root)
    {
        _lastTool = null;
        var type = root.TryGetProperty("type", out var typeEl) ? typeEl.GetString() : null;

        if (type is "content_block_start" &&
            root.TryGetProperty("content_block", out var block) &&
            block.ValueKind == JsonValueKind.Object)
        {
            var index = Index(root);
            var blockType = block.TryGetProperty("type", out var blockTypeEl) ? blockTypeEl.GetString() : null;
            var acc = GetBlock(index);
            acc.Kind = blockType ?? "";
            if (blockType is "tool_use")
            {
                acc.Id = StringProp(block, "id") ?? acc.Id;
                acc.Name = StringProp(block, "name") ?? acc.Name;
                _lastTool = acc.ToDto("pending");
            }
        }
        else if (type is "content_block_delta" &&
                 root.TryGetProperty("delta", out var delta) &&
                 delta.ValueKind == JsonValueKind.Object)
        {
            var index = Index(root);
            var acc = GetBlock(index);
            var deltaType = StringProp(delta, "type");
            if (deltaType is "text_delta")
            {
                var text = StringProp(delta, "text");
                return new RoundApplyResult(string.IsNullOrEmpty(text) ? null : text, null);
            }

            if (deltaType is "input_json_delta")
            {
                var json = StringProp(delta, "partial_json");
                if (!string.IsNullOrEmpty(json))
                    acc.Arguments.Append(json);
                if (acc.Kind is "tool_use")
                    _lastTool = acc.ToDto("pending");
            }
        }
        else if (type is "error")
        {
            var message = root.TryGetProperty("error", out var error) &&
                          error.TryGetProperty("message", out var errMessage)
                ? errMessage.GetString()
                : "Claude stream error";
            throw new InvalidOperationException(message ?? "Claude stream error");
        }

        return new RoundApplyResult(null, _lastTool);
    }

    public IReadOnlyList<ProviderToolCall> CompletedToolCalls() =>
        _blocks
            .OrderBy(pair => pair.Key)
            .Select(pair => pair.Value)
            .Where(block => block.Kind is "tool_use" && !string.IsNullOrWhiteSpace(block.Name))
            .Select(block => block.ToCall())
            .ToList();

    private BlockAcc GetBlock(int index)
    {
        if (_blocks.TryGetValue(index, out var existing))
            return existing;
        var created = new BlockAcc();
        _blocks[index] = created;
        return created;
    }

    private static int Index(JsonElement root) =>
        root.TryGetProperty("index", out var indexEl) && indexEl.TryGetInt32(out var parsed) ? parsed : 0;

    private static string? StringProp(JsonElement el, string name) =>
        el.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private sealed class BlockAcc
    {
        public string Kind { get; set; } = "";
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Name { get; set; } = "tool";
        public StringBuilder Arguments { get; } = new();

        public ProviderToolCall ToCall() => new(Id, Name, Arguments.ToString());

        public ChatToolCallDto ToDto(string status)
        {
            var call = ToCall();
            return new ChatToolCallDto(call.Id, call.Name, status, Arguments: call.Arguments);
        }
    }
}

public sealed class OllamaRoundAccumulator
{
    private readonly List<ProviderToolCall> _tools = [];
    private ChatToolCallDto? _lastTool;

    public RoundApplyResult Apply(JsonElement root)
    {
        _lastTool = null;
        string? text = null;

        if (root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.String)
            throw new InvalidOperationException(error.GetString() ?? "Ollama error");

        if (root.TryGetProperty("message", out var message) && message.ValueKind == JsonValueKind.Object)
        {
            if (message.TryGetProperty("content", out var contentEl) &&
                contentEl.ValueKind == JsonValueKind.String)
            {
                text = contentEl.GetString();
            }

            if (message.TryGetProperty("tool_calls", out var toolCalls) &&
                toolCalls.ValueKind == JsonValueKind.Array)
            {
                _tools.Clear();
                var index = 0;
                foreach (var call in toolCalls.EnumerateArray())
                {
                    var mapped = MapCall(call, index++);
                    _tools.Add(mapped);
                    _lastTool = new ChatToolCallDto(mapped.Id, mapped.Name, "pending", Arguments: mapped.Arguments);
                }
            }
        }

        return new RoundApplyResult(
            string.IsNullOrEmpty(text) ? null : text,
            _lastTool);
    }

    public bool IsDone(JsonElement root) =>
        root.TryGetProperty("done", out var doneEl) && doneEl.ValueKind == JsonValueKind.True;

    public IReadOnlyList<ProviderToolCall> CompletedToolCalls() => _tools.ToList();

    private static ProviderToolCall MapCall(JsonElement call, int index)
    {
        var id = call.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
            ? idEl.GetString()
            : null;

        var fn = call.TryGetProperty("function", out var fnEl) && fnEl.ValueKind == JsonValueKind.Object
            ? fnEl
            : call;

        var name = fn.TryGetProperty("name", out var nameEl) && nameEl.ValueKind == JsonValueKind.String
            ? nameEl.GetString()
            : "tool";

        var arguments = "{}";
        if (fn.TryGetProperty("arguments", out var argsEl))
        {
            arguments = argsEl.ValueKind == JsonValueKind.String
                ? argsEl.GetString() ?? "{}"
                : argsEl.GetRawText();
        }

        return new ProviderToolCall(
            string.IsNullOrWhiteSpace(id) ? $"call_{index}" : id,
            string.IsNullOrWhiteSpace(name) ? "tool" : name,
            arguments);
    }
}
