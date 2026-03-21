import { createClient } from "@supabase/supabase-js";

function normalizeDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const authHeader = req.headers["authorization"] || "";
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const today = new Date();
    const inTwoDays = new Date(today);
    inTwoDays.setDate(today.getDate() + 2);

    const [alertsResult, docsResult, bidsResult] = await Promise.all([
      supabase.from("manual_alerts").select("user_id,description,event_date").lte("event_date", inTwoDays.toISOString()),
      supabase.from("documents").select("uploaded_by,name,expiration_date").not("expiration_date", "is", null).lte("expiration_date", inTwoDays.toISOString()),
      supabase.from("bids").select("id,title,closing_date").not("closing_date", "is", null).lte("closing_date", inTwoDays.toISOString())
    ]);

    const notifications = [];

    for (const alert of alertsResult.data || []) {
      notifications.push({
        user_id: alert.user_id,
        channel: "email",
        message: `Alerta manual proximo: ${alert.description} em ${normalizeDate(alert.event_date)}`
      });
    }

    for (const doc of docsResult.data || []) {
      if (!doc.uploaded_by) continue;
      notifications.push({
        user_id: doc.uploaded_by,
        channel: "email",
        message: `Documento proximo do vencimento: ${doc.name} em ${normalizeDate(doc.expiration_date)}`
      });
    }

    const usersResult = await supabase.from("notifications").select("user_id").eq("email_notifications", true);
    const enabledUsers = new Set((usersResult.data || []).map((row) => row.user_id));

    for (const bid of bidsResult.data || []) {
      for (const userId of enabledUsers) {
        notifications.push({
          user_id: userId,
          bid_id: bid.id,
          channel: "email",
          message: `Prazo de edital proximo: ${bid.title} em ${normalizeDate(bid.closing_date)}`
        });
      }
    }

    if (notifications.length > 0) {
      await supabase.from("notifications").insert(notifications);
    }

    return res.status(200).json({ created: notifications.length });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Falha no cron de lembretes" });
  }
}
