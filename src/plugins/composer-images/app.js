// ComposerImages: the image strip in the prompt box, plus paste, drop and the "Add images" action (03 §3).

import { h, clear, icon } from "../../lib/dom.js";
import { uniqueImageName } from "./names.js";

export default {
  start(ctx) {
    const t = ctx.t;
    const shellUi = ctx.services.get("ui");
    const composer = ctx.services.get("composer");
    if (!composer) return;
    const box = composer.element;
    const strip = h("div.cc-composer-images", { hidden: true });
    box.prepend(strip);
    ctx.onDispose(() => strip.remove());
    let counter = 0;

    const render = () => {
      const images = composer.images();
      clear(strip);
      strip.hidden = !images.length;
      for (const image of images) {
        const remove = h("button", { type: "button", "aria-label": t("composer.removeImage"), dataset: { tip: t("composer.removeImage"), tipId: "topbar.removeImage" } }, icon("x", { size: 11 }));
        remove.addEventListener("mousedown", (e) => e.preventDefault());
        remove.addEventListener("click", () => composer.setImages(composer.images().filter((x) => x.id !== image.id)));
        strip.append(h("div.cc-composer-thumb", { dataset: { tip: image.name } }, h("img", { attrs: { src: image.dataUrl, alt: image.name } }), remove));
      }
    };
    ctx.events.on("Composer:input", render);

    const readFile = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    const addFiles = async (fileList) => {
      const files = [...(fileList ?? [])].filter((f) => /^image\//.test(f.type));
      if (!files.length) {
        shellUi.toast(t("composer.images.none"), "error");
        return 0;
      }
      const images = composer.images();
      let added = 0;
      for (const file of files) {
        try {
          const dataUrl = await readFile(file);
          const taken = new Set(images.map((x) => x.name));
          counter += 1;
          images.push({ name: uniqueImageName(file.name, file.type, taken, counter), type: file.type, size: file.size, lastModified: file.lastModified, dataUrl });
          added += 1;
        } catch (error) {
          ctx.logger.warn("Reading an image failed:", error);
          shellUi.toast(t("composer.images.readFailed"), "error");
        }
      }
      if (added) {
        composer.setImages(images);
        shellUi.toast(t("composer.images.added", { count: added, total: images.length }), "success");
      }
      return added;
    };
    const pick = () => {
      const input = h("input", { type: "file", attrs: { accept: "image/*", multiple: "" } });
      input.addEventListener("change", () => addFiles(input.files));
      input.click();
    };

    const on = (el, type, fn, opts) => {
      el.addEventListener(type, fn, opts);
      ctx.onDispose(() => el.removeEventListener(type, fn, opts));
    };
    on(composer.textarea, "paste", (event) => {
      const files = [...(event.clipboardData?.files ?? [])].filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      event.preventDefault();
      addFiles(files);
    });
    on(box, "dragover", (event) => {
      if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
      event.preventDefault();
      box.classList.add("drop-hover");
    });
    on(box, "dragleave", (event) => {
      if (!box.contains(event.relatedTarget)) box.classList.remove("drop-hover");
    });
    on(box, "drop", (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      box.classList.remove("drop-hover");
      addFiles(event.dataTransfer.files);
    });

    ctx.contribute("composer.action", { id: "addImage", icon: "paperclip", labelKey: "composer.addImage", order: 0, onClick: () => pick() });
    ctx.services.provide("composerImages", { pick, addFiles });
    // Drafts drop their images while this plugin is off.
    ctx.onDispose(() => composer.setImages([]));
    render();
  },
};
