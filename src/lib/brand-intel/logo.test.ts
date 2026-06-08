import { describe, it, expect } from "vitest";
import { pickLogo } from "./logo";

describe("pickLogo", () => {
  it("prefers an image whose attributes mention 'logo'", () => {
    const logo = pickLogo([
      { src: "/hero.jpg", alt: "hero" },
      { src: "/assets/site-logo.svg", alt: "Acme logo" },
      { src: "/photo.png" },
    ]);
    expect(logo).toBe("/assets/site-logo.svg");
  });

  it("falls back to the first header image when nothing looks like a logo", () => {
    const logo = pickLogo([
      { src: "/a.jpg" },
      { src: "/header-banner.jpg", inHeader: true },
    ]);
    expect(logo).toBe("/header-banner.jpg");
  });

  it("ignores data URIs and returns undefined when there are no usable images", () => {
    expect(pickLogo([{ src: "data:image/png;base64,xxxx" }])).toBeUndefined();
    expect(pickLogo([])).toBeUndefined();
  });
});
