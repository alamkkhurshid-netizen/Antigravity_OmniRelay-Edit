import * as React from "react";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = "", children, error, disabled, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          className={`flex h-10 w-full appearance-none rounded-lg border bg-background px-3 py-2 pr-9 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${
            error ? "border-destructive focus-visible:ring-destructive" : "border-input"
          } ${className}`}
          ref={ref}
          disabled={disabled}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
);

Select.displayName = "Select";
