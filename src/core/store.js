import { emit } from "./events.js";

const state = {
  activeView: "dashboard",
};

export function getState() {
  return state;
}

export function setActiveView(viewName) {
  state.activeView = viewName;
  emit("view:changed", viewName);
}
