import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

interface WritePromptIllustrationProps extends SVGProps<SVGSVGElement> {}

export function WritePromptIllustration({
  className,
  ...props
}: WritePromptIllustrationProps) {
  return (
    <svg
      width="500"
      height="350"
      viewBox="0 0 500 350"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
      aria-hidden="true"
      {...props}
    >
      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M 0 50 L 0 88 C 0 94, 6 100, 12 100 L 88 100 C 94 100, 100 94, 100 88 L 100 50"
          transform="matrix(1, 0.5, -1, 0.5, 245, 215)"
          fill="none"
          stroke="#e0e0e0"
          strokeWidth="4"
        />
        <path
          d="M 0 50 L 0 88 C 0 94, 6 100, 12 100 L 88 100 C 94 100, 100 94, 100 88 L 100 50"
          transform="matrix(1, 0.5, -1, 0.5, 245, 195)"
          fill="none"
          stroke="#c0c0c0"
          strokeWidth="4"
        />

        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="12"
          transform="matrix(1, 0.5, -1, 0.5, 245, 175)"
          fill="#ffffff"
          stroke="#555555"
          strokeWidth="4"
        />
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="12"
          transform="matrix(1, 0.5, -1, 0.5, 245, 165)"
          fill="#ffffff"
          stroke="#555555"
          strokeWidth="4"
        />
        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="12"
          transform="matrix(1, 0.5, -1, 0.5, 245, 155)"
          fill="#ffffff"
          stroke="#555555"
          strokeWidth="4"
        />

        <rect
          x="0"
          y="0"
          width="100"
          height="100"
          rx="12"
          transform="matrix(1.1, 0.85, -1.1, 0.35, 250, 95)"
          fill="#ffffff"
          stroke="#555555"
          strokeWidth="4"
        />

        <g transform="matrix(1.1, 0.85, -1.1, 0.35, 250, 85)">
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            rx="12"
            fill="#ffffff"
            stroke="#555555"
            strokeWidth="4"
          />

          <line
            x1="20"
            y1="25"
            x2="85"
            y2="25"
            stroke="#555555"
            strokeWidth="3.5"
          />
          <line
            x1="20"
            y1="45"
            x2="85"
            y2="45"
            stroke="#555555"
            strokeWidth="3.5"
          />
          <line
            x1="20"
            y1="65"
            x2="85"
            y2="65"
            stroke="#555555"
            strokeWidth="3.5"
          />
          <line
            x1="20"
            y1="85"
            x2="60"
            y2="85"
            stroke="#555555"
            strokeWidth="3.5"
          />
        </g>

        <g transform="translate(295, 155) rotate(-55)">
          <path
            d="M 30 -14 L 6 -4 C 1 -2, 1 2, 6 4 L 30 14 L 95 14 C 105 14, 110 5, 110 0 C 110 -5, 105 -14, 95 -14 Z"
            fill="#ffffff"
            stroke="#555555"
            strokeWidth="4"
          />
          <line
            x1="30"
            y1="-14"
            x2="30"
            y2="14"
            stroke="#555555"
            strokeWidth="3.5"
          />
        </g>
      </g>
    </svg>
  );
}
