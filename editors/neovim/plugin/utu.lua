-- utu for Neovim (0.11+): the filetype, the language server (`utu lsp`), and
-- tree-sitter highlighting, injections (Wutu inside `@wutu/\ … \/`), and folds.
-- editors/neovim/install.mjs copies this with @REPO@ replaced by the
-- repository's path, beside the grammars and queries it builds.

vim.filetype.add({ extension = { utu = 'utu' } })

vim.lsp.config('utu', {
  cmd = { 'node', '@REPO@/cli/utu.mjs', 'lsp' },
  filetypes = { 'utu' },
  root_markers = { 'package.json', '.git' },
})
vim.lsp.enable('utu')

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'utu',
  group = vim.api.nvim_create_augroup('utu', { clear = true }),
  callback = function(args)
    local bo = vim.bo[args.buf]
    bo.commentstring = '// %s'
    bo.expandtab = true
    bo.shiftwidth = 4
    bo.tabstop = 4
    -- Highlighting and injections from the grammar; the language server's
    -- names (types, functions, fields, …) are laid over them.
    if pcall(vim.treesitter.start, args.buf, 'utu') then
      local win = vim.fn.bufwinid(args.buf)
      if win ~= -1 then
        vim.wo[win].foldmethod = 'expr'
        vim.wo[win].foldexpr = 'v:lua.vim.treesitter.foldexpr()'
        vim.wo[win].foldlevel = 99
      end
      -- Indentation from the grammar, when nvim-treesitter is there to read it.
      -- (Its main branch has indentexpr(); master, nvim_treesitter#indent().)
      local ok, ts = pcall(require, 'nvim-treesitter')
      if ok and type(ts) == 'table' and ts.indentexpr then
        bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
      elseif vim.fn.exists('*nvim_treesitter#indent') == 1 then
        bo.indentexpr = 'nvim_treesitter#indent()'
      end
    end
  end,
})
