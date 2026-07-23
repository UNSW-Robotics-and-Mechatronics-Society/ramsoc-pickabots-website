"use client";

import { OptionCard } from "./ui";

export type UserType = "unsw" | "other_uni" | "high_school";

const USER_TYPE_OPTIONS: {
  value: UserType;
  title: string;
  description: string;
}[] = [
  { value: "unsw", title: "UNSW Student", description: "Currently enrolled at UNSW" },
  { value: "other_uni", title: "Other University", description: "Enrolled at another university" },
  { value: "high_school", title: "High School Student", description: "Currently attending high school" },
];

export default function UserTypeStep({ onSelect }: { onSelect: (type: UserType) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="mb-2 text-2xl">Who are you?</h2>
        <p className="text-sm text-foreground/50">
          This helps us set up your competitor profile.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {USER_TYPE_OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            title={opt.title}
            description={opt.description}
            onClick={() => onSelect(opt.value)}
          />
        ))}
      </div>
    </div>
  );
}
