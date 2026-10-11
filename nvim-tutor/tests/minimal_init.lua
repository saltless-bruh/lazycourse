local lazy = vim.fn.stdpath("data") .. "/lazy"
vim.opt.rtp:prepend(lazy .. "/plenary.nvim")
vim.opt.rtp:prepend(lazy .. "/nui.nvim")
vim.opt.rtp:prepend(vim.fn.fnamemodify(debug.getinfo(1, "S").source:sub(2), ":p:h:h"))
