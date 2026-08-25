import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware-helpers";
import { validateBody, createNotificationSchema } from "@/lib/validation";
import { internalError } from "@/lib/api-error";
import * as notificationService from "@/services/notifications-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(request, "notifications.read", async () => {
    try {
      const limit = Math.min(100, Number(request.nextUrl.searchParams.get("limit") ?? 30));
      const result = await notificationService.listNotifications(limit);
      return NextResponse.json({ ok: true, ...result });
    } catch {
      return internalError();
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, "notifications.write", async () => {
    const v = await validateBody(request, createNotificationSchema);
    if (!v.success) return v.error;

    try {
      const row = await notificationService.createNotification(v.data);
      return NextResponse.json({ ok: true, notification: row }, { status: 201 });
    } catch {
      return internalError();
    }
  });
}
