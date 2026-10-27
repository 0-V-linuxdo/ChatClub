// Settings control: checklist of plugins shown in the quick menu. `null` means "all toggleable plugins".

let hostRef = null;
export function setPickerHost(host) {
  hostRef = host;
}

export function toggleablePlugins(host) {
  return host.order.map((n) => host.plugins[n]).filter((p) => !p.hidden && !p.required);
}

export function pickerComponent({ value, setValue }) {
  const host = hostRef;
  const box = document.createElement("div");
  box.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px;width:100%;";
  if (!host) return box;
  const all = toggleablePlugins(host).map((p) => p.name).sort();
  let selected = new Set(Array.isArray(value) ? value : all);
  for (const name of all) {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:6px;min-height:24px;";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = selected.has(name);
    input.style.accentColor = "var(--primary)";
    input.addEventListener("change", () => {
      if (input.checked) selected.add(name);
      else selected.delete(name);
      setValue([...selected]);
    });
    label.append(input, document.createTextNode(name));
    box.append(label);
  }
  return box;
}
