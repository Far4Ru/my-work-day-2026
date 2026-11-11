import { useEffect, useState } from "react";
import desk00 from "./assets/backgrounds/desk-00.jpg";
import desk02 from "./assets/backgrounds/desk-02.jpg";
import desk04 from "./assets/backgrounds/desk-04.jpg";
import desk06 from "./assets/backgrounds/desk-06.jpg";
import desk08 from "./assets/backgrounds/desk-08.jpg";
import desk10 from "./assets/backgrounds/desk-10.jpg";
import desk12 from "./assets/backgrounds/desk-12.jpg";
import desk14 from "./assets/backgrounds/desk-14.jpg";
import desk16 from "./assets/backgrounds/desk-16.jpg";
import desk18 from "./assets/backgrounds/desk-18.jpg";
import desk20 from "./assets/backgrounds/desk-20.jpg";
import desk22 from "./assets/backgrounds/desk-22.jpg";

const backgrounds = [
  desk00,
  desk02,
  desk04,
  desk06,
  desk08,
  desk10,
  desk12,
  desk14,
  desk16,
  desk18,
  desk20,
  desk22,
];

function currentTimeSlot(): number {
  return Math.floor(new Date().getHours() / 2);
}

export default function TimeOfDayBackground() {
  const [timeSlot, setTimeSlot] = useState(currentTimeSlot);
  const [visibleSlot, setVisibleSlot] = useState(timeSlot);
  const [previousSlot, setPreviousSlot] = useState<number | null>(null);

  useEffect(() => {
    const updateTimeSlot = () => setTimeSlot(currentTimeSlot());
    const interval = window.setInterval(updateTimeSlot, 30_000);

    document.addEventListener("visibilitychange", updateTimeSlot);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateTimeSlot);
    };
  }, []);

  useEffect(() => {
    if (timeSlot === visibleSlot) return;

    const image = new Image();
    let cancelled = false;
    let shown = false;

    const showNextBackground = () => {
      if (cancelled || shown) return;
      shown = true;
      setPreviousSlot(visibleSlot);
      setVisibleSlot(timeSlot);
    };

    image.onload = showNextBackground;
    image.src = backgrounds[timeSlot];

    if (image.complete && image.naturalWidth > 0) {
      showNextBackground();
    }

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [timeSlot, visibleSlot]);

  return (
    <>
      {previousSlot !== null && (
        <div
          className="time-background"
          style={{ backgroundImage: `url(${backgrounds[previousSlot]})` }}
          aria-hidden="true"
        />
      )}
      <div
        key={visibleSlot}
        className={`time-background${previousSlot !== null ? " time-background--incoming" : ""}`}
        style={{ backgroundImage: `url(${backgrounds[visibleSlot]})` }}
        aria-hidden="true"
      />
    </>
  );
}
