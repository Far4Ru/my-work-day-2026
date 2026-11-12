import { useEffect, useState } from "react";
import panorama00 from "../assets/backgrounds/window-panorama-00.png";
import panorama02 from "../assets/backgrounds/window-panorama-02.png";
import panorama04 from "../assets/backgrounds/window-panorama-04.png";
import panorama06 from "../assets/backgrounds/window-panorama-06.png";
import panorama08 from "../assets/backgrounds/window-panorama-08.png";
import panorama10 from "../assets/backgrounds/window-panorama-10.png";
import panorama12 from "../assets/backgrounds/window-panorama-12.png";
import panorama14 from "../assets/backgrounds/window-panorama-14.png";
import panorama16 from "../assets/backgrounds/window-panorama-16.png";
import panorama18 from "../assets/backgrounds/window-panorama-18.png";
import panorama20 from "../assets/backgrounds/window-panorama-20.png";
import panorama22 from "../assets/backgrounds/window-panorama-22.png";

const panoramas = [
  panorama00,
  panorama02,
  panorama04,
  panorama06,
  panorama08,
  panorama10,
  panorama12,
  panorama14,
  panorama16,
  panorama18,
  panorama20,
  panorama22,
];

function currentTimeSlot(): number {
  return Math.floor(new Date().getHours() / 2);
}

export default function TimeOfDayBackground() {
  const [timeSlot, setTimeSlot] = useState(currentTimeSlot);
  const [visibleSlot, setVisibleSlot] = useState(timeSlot);
  const [previousSlot, setPreviousSlot] = useState<number | null>(null);

  useEffect(() => {
    let resizeTimeout: number;

    const handleResize = () => {
      document.documentElement.classList.add("viewport-resizing");
      window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        document.documentElement.classList.remove("viewport-resizing");
      }, 200);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeTimeout);
      document.documentElement.classList.remove("viewport-resizing");
    };
  }, []);

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
    image.src = panoramas[timeSlot];

    if (image.complete && image.naturalWidth > 0) {
      showNextBackground();
    }

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [timeSlot, visibleSlot]);

  useEffect(() => {
    if (previousSlot === null) return;

    const timeout = window.setTimeout(() => setPreviousSlot(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [previousSlot, visibleSlot]);

  return (
    <>
      {previousSlot !== null && (
        <div
          className="time-background"
          style={{ backgroundImage: `url(${panoramas[previousSlot]})` }}
          aria-hidden="true"
        />
      )}
      <div
        key={visibleSlot}
        className={`time-background${previousSlot !== null ? " time-background--incoming" : ""}`}
        style={{ backgroundImage: `url(${panoramas[visibleSlot]})` }}
        aria-hidden="true"
      />
    </>
  );
}
