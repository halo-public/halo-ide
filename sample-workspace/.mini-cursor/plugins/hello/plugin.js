function activate(api) {
  api.registerContextMenuItem({
    id: 'logPath',
    title: 'Log Path',
    locations: ['explorer', 'editor'],
    run: function (ctx) {
      api.log(ctx.path || ctx.workspaceRoot)
    },
  })

  api.registerContextMenuItem({
    id: 'logJsPath',
    title: 'Log JS Path',
    locations: ['explorer', 'editor'],
    files: ['.js', 'javascript'],
    run: function (ctx) {
      api.log(ctx.path)
    },
  })

  api.registerLanguage({
    id: 'hello',
    extensions: ['.hello'],
    aliases: ['Hello'],
    monarch: {
      tokenizer: {
        root: [
          [/#[^\n]*/, 'comment'],
          [/\b(hello|world|plugin)\b/, 'keyword'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/\d+/, 'number'],
        ],
      },
    },
  })

  api.registerTitleItem({
    id: 'logPathTitle',
    title: 'Log Path',
    locations: ['explorer', 'editor'],
    run: function (ctx) {
      api.log(ctx.path || ctx.workspaceRoot)
    },
  })
}
