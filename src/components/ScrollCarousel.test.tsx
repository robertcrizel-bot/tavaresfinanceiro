import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScrollCarousel } from "@/components/ScrollCarousel";

const items = Array.from({ length: 6 }, (_, i) => (
  <div key={i} data-carousel-item className="w-[120px] shrink-0">
    Item {i}
  </div>
));

function getTrack(container: HTMLElement): HTMLElement {
  return container.querySelector<HTMLElement>("[data-scroll-track]")!;
}

function stubMetrics(
  track: HTMLElement,
  { scrollWidth, clientWidth, scrollLeft }: { scrollWidth: number; clientWidth: number; scrollLeft: number },
) {
  Object.defineProperty(track, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(track, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(track, "scrollLeft", { configurable: true, writable: true, value: scrollLeft });
}

const prev = () => screen.getByRole("button", { name: "Ver itens anteriores" });
const next = () => screen.getByRole("button", { name: "Ver próximos itens" });

describe("ScrollCarousel", () => {
  it("hides both arrows when there is nothing to scroll", () => {
    const { container } = render(<ScrollCarousel>{items}</ScrollCarousel>);
    expect(prev()).toHaveAttribute("tabindex", "-1");
    expect(next()).toHaveAttribute("tabindex", "-1");
    expect(prev().className).toContain("opacity-0");
    expect(next().className).toContain("opacity-0");
    expect(container).toBeTruthy();
  });

  it("shows only the next arrow when the track is at the start", () => {
    const { container } = render(<ScrollCarousel>{items}</ScrollCarousel>);
    const track = getTrack(container);
    stubMetrics(track, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
    fireEvent.scroll(track);

    expect(prev().className).toContain("opacity-0");
    expect(next().className).toContain("opacity-100");
    expect(next()).toHaveAttribute("tabindex", "0");
  });

  it("shows only the previous arrow when the track is at the end", () => {
    const { container } = render(<ScrollCarousel>{items}</ScrollCarousel>);
    const track = getTrack(container);
    stubMetrics(track, { scrollWidth: 600, clientWidth: 300, scrollLeft: 300 });
    fireEvent.scroll(track);

    expect(prev().className).toContain("opacity-100");
    expect(prev()).toHaveAttribute("tabindex", "0");
    expect(next().className).toContain("opacity-0");
  });

  it("moves the track smoothly when an arrow is clicked", () => {
    const { container } = render(<ScrollCarousel>{items}</ScrollCarousel>);
    const track = getTrack(container);
    stubMetrics(track, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
    fireEvent.scroll(track);
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy;

    fireEvent.click(next());

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0][0]).toMatchObject({ behavior: "smooth" });
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);

    fireEvent.click(prev());
    expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0);
  });

  it("keeps every child in a single scrollable line", () => {
    const { container } = render(<ScrollCarousel className="gap-1 pb-0">{items}</ScrollCarousel>);
    const track = getTrack(container);
    expect(track.className).toContain("overflow-x-auto");
    expect(track.className).toContain("snap-x");
    expect(track.className).toContain("gap-1");
    expect(track.className).not.toContain("gap-3");
    expect(track.children).toHaveLength(6);
    for (const child of Array.from(track.children)) {
      expect(child).toHaveAttribute("data-carousel-item");
      expect(child.className).toContain("shrink-0");
    }
  });
});
