using System.Text.Json;
using MiniCursor.Api.Services;
using Xunit;

namespace MiniCursor.Api.Tests;

public class ProviderRoundAccumulatorTests
{
    [Fact]
    public void OpenAi_assembles_incremental_tool_calls_and_text()
    {
        var acc = new OpenAiRoundAccumulator();

        var text = Apply(acc, """
            {"choices":[{"delta":{"content":"Looking"}}]}
            """);
        Assert.Equal("Looking", text.TextDelta);
        Assert.Null(text.ToolUpdate);

        var start = Apply(acc, """
            {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_file","arguments":""}}]}}]}
            """);
        Assert.Equal("call_1", start.ToolUpdate?.Id);
        Assert.Equal("read_file", start.ToolUpdate?.Name);

        Apply(acc, """
            {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"path\":\"src/a.ts\"}"}}]}}]}
            """);

        var calls = acc.CompletedToolCalls();
        var call = Assert.Single(calls);
        Assert.Equal("call_1", call.Id);
        Assert.Equal("read_file", call.Name);
        Assert.Equal("""{"path":"src/a.ts"}""", call.Arguments);
    }

    [Fact]
    public void Claude_assembles_tool_use_json_deltas()
    {
        var acc = new ClaudeRoundAccumulator();

        var start = Apply(acc, """
            {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"grep","input":{}}}
            """);
        Assert.Equal("toolu_1", start.ToolUpdate?.Id);
        Assert.Equal("grep", start.ToolUpdate?.Name);

        Apply(acc, """
            {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"query\":"}}
            """);
        var done = Apply(acc, """
            {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"TODO\"}"}}
            """);
        Assert.Equal("grep", done.ToolUpdate?.Name);

        var text = Apply(acc, """
            {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}
            """);
        Assert.Equal("Hi", text.TextDelta);

        var call = Assert.Single(acc.CompletedToolCalls());
        Assert.Equal("toolu_1", call.Id);
        Assert.Equal("grep", call.Name);
        Assert.Equal("""{"query":"TODO"}""", call.Arguments);
    }

    [Fact]
    public void Ollama_maps_object_arguments()
    {
        var acc = new OllamaRoundAccumulator();
        var applied = Apply(acc, """
            {"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"list_dir","arguments":{"path":"src"}}}]},"done":true}
            """);

        Assert.Equal("list_dir", applied.ToolUpdate?.Name);
        var call = Assert.Single(acc.CompletedToolCalls());
        Assert.Equal("list_dir", call.Name);
        Assert.Contains("src", call.Arguments);
    }

    private static RoundApplyResult Apply(OpenAiRoundAccumulator acc, string json) =>
        acc.Apply(JsonDocument.Parse(json).RootElement);

    private static RoundApplyResult Apply(ClaudeRoundAccumulator acc, string json) =>
        acc.Apply(JsonDocument.Parse(json).RootElement);

    private static RoundApplyResult Apply(OllamaRoundAccumulator acc, string json) =>
        acc.Apply(JsonDocument.Parse(json).RootElement);
}
