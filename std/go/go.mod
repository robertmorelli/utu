// For testing the Go host here, with gosm checked out beside utu.
// `utu build` copies the .go files (not this, and not the tests) into the
// built program's own package.
module utu.local/std/go

go 1.24

require gosm v0.0.0

replace gosm => ../../../gosm
