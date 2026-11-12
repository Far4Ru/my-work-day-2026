type IconName =
  | "tasks"
  | "calendar"
  | "statistics"
  | "reports"
  | "chevron-left"
  | "chevron-right"
  | "plus"
  | "arrow-left"
  | "arrow-right"
  | "check"
  | "restore"
  | "edit"
  | "delete"
  | "save"
  | "close"
  | "clock"
  | "stop"
  | "date";

export default function Icon({ name }: { name: IconName }) {
  return (
    <img
      className="icon"
      src={`${import.meta.env.BASE_URL}icons/${name}.svg`}
      alt=""
      aria-hidden="true"
    />
  );
}
