// The stylesheet is bundled as text (js/build.mjs) and installed by main.tsx.
declare module '*.css' {
  const text: string;
  export default text;
}
