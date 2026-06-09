import { ButtonHTMLAttributes, ReactNode } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "amber";
  block?: boolean;
  children: ReactNode;
};

export function Button({ variant = "secondary", block, className = "", children, ...rest }: BtnProps) {
  return (
    <button
      className={`btn btn-${variant} ${block ? "btn-block" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button className="icon-btn" aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export function Pill({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return (
    <span className={`pill ${warn ? "warn" : ""}`}>
      <span className="dot" />
      {children}
    </span>
  );
}
