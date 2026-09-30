import * as Sentry from "@sentry/nextjs";

type LogContext = {
  route?: string;
  userId?: string;
  orgId?: string;
  [key: string]: unknown;
};

export const logger = {
  info: (message: string, context?: LogContext) => {
    console.log(`[INFO] ${message}`, context ? context : "");
    if (context) {
      Sentry.addBreadcrumb({
        category: "info",
        message,
        data: context,
        level: "info",
      });
    }
  },
  
  warn: (message: string, context?: LogContext) => {
    console.warn(`[WARN] ${message}`, context ? context : "");
    Sentry.captureMessage(message, {
      level: "warning",
      extra: context,
    });
  },
  
  error: (message: string, error?: unknown, context?: LogContext) => {
    console.error(`[ERROR] ${message}`, error, context ? context : "");
    Sentry.withScope((scope) => {
      if (context?.userId) scope.setUser({ id: context.userId });
      if (context?.orgId) scope.setTag("organization_id", context.orgId);
      if (context?.route) scope.setTag("route", context.route);
      
      if (context) {
        scope.setExtras(context);
      }
      
      if (error instanceof Error) {
        Sentry.captureException(error);
      } else {
        Sentry.captureException(new Error(message), { extra: { originalError: error } });
      }
    });
  }
};
