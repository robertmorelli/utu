# Wutu Playground

Edit Wutu on the left and see the compiled website on the right. The compiler
runs in your browser; the preview runs in a sandboxed iframe. The example is
saved in this browser's local storage. This first version supports one source
file and the built-in browser bindings; package imports need the full Wutu CLI.

From the repository root:

```sh
npm run demo:webdemo
python3 -m http.server 4177 --directory webdemo
```

Open <http://localhost:4177>. The preview updates as you edit. You can also
press ⌘/Ctrl+Enter to compile immediately.
