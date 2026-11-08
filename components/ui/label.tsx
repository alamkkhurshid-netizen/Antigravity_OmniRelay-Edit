import * as React from "react";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function Label({ className = "", children, required, ...props }: LabelProps) {
  return (
    <label
      className={`text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1 ${className}`}
      {...props}
    >
      {children}
      {required && <span className="text-destructive">*</span>}
    </label>
  );
}
