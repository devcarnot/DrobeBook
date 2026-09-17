import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ScrollablePillTabsProps = {
  ariaLabel: string;
  hint?: string;
  activeKey?: string;
  children: ReactNode;
};

export function ScrollablePillTabs({
  ariaLabel,
  hint,
  activeKey,
  children,
}: ScrollablePillTabsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const skipScrollRef = useRef(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    const maxScrollLeft = track.scrollWidth - track.clientWidth;
    setCanScrollLeft(track.scrollLeft > 2);
    setCanScrollRight(maxScrollLeft > 2 && track.scrollLeft < maxScrollLeft - 2);
  }, []);

  useEffect(() => {
    updateScrollState();

    const track = trackRef.current;
    if (!track) {
      return;
    }

    track.addEventListener("scroll", updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(track);

    return () => {
      track.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState, children]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }

    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      track.scrollLeft = 0;
      updateScrollState();
      return;
    }

    if (!activeKey) {
      return;
    }

    const activeTab = track.querySelector<HTMLElement>('[aria-selected="true"]');
    activeTab?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeKey, updateScrollState]);

  function scrollBy(direction: -1 | 1) {
    trackRef.current?.scrollBy({
      left: direction * 200,
      behavior: "smooth",
    });
  }

  const shellClassName = [
    "gk-scroll-tabs__shell",
    canScrollLeft ? "gk-scroll-tabs__shell--left" : "",
    canScrollRight ? "gk-scroll-tabs__shell--right" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="gk-scroll-tabs">
      {hint ? <p className="gk-scroll-tabs__hint">{hint}</p> : null}

      <div className={shellClassName}>
        <button
          type="button"
          className="gk-scroll-tabs__btn"
          aria-label="Show previous steps"
          disabled={!canScrollLeft}
          onClick={() => scrollBy(-1)}
        >
          ‹
        </button>

        <div
          ref={trackRef}
          role="tablist"
          aria-label={ariaLabel}
          className="gk-scroll-tabs__track"
        >
          {children}
        </div>

        <button
          type="button"
          className="gk-scroll-tabs__btn"
          aria-label="Show more steps"
          disabled={!canScrollRight}
          onClick={() => scrollBy(1)}
        >
          ›
        </button>
      </div>

      {canScrollRight ? (
        <p className="gk-scroll-tabs__more" aria-live="polite">
          More steps on the right — scroll or tap ›
        </p>
      ) : null}
    </div>
  );
}
