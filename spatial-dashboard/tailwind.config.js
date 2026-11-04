export default {
  content: ["./*.html", "./auth/**/*.html", "./src/**/*.js"],
  darkMode: "class",
  theme: { extend: {
    colors: {
      surface: { 0: "#0f1117", 1: "#161922", 2: "#1d2130", 3: "#262b3d" },
      line: { DEFAULT: "#2c3245", strong: "#3b4258" },
    },
  } },
};
