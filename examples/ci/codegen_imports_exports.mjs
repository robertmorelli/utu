export default {
  es: {
    console_log() {
      return undefined;
    },
    wrap(value) {
      return `[${value}]`;
    },
  },
};
