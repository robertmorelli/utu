export default {
  maybe_label(flag) {
    if (flag) return "online";
    throw new Error("offline");
  },

  maybe_structured(flag) {
    if (flag) return ["online", null];
    throw new Error("offline");
  },
};
