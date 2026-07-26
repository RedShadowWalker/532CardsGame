import { avatarColor, initials } from "../lib/avatar";

interface PlayerAvatarProps {
  playerId: string;
  name: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES: Record<NonNullable<PlayerAvatarProps["size"]>, string> = {
  sm: "w-7 h-7 text-[10px]",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
};

export function PlayerAvatar({ playerId, name, size = "md" }: PlayerAvatarProps) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full flex items-center justify-center font-bold text-white shadow-md border-2 border-white/30 flex-shrink-0`}
      style={{ backgroundColor: avatarColor(playerId) }}
    >
      {initials(name)}
    </div>
  );
}