import { supabase } from "../supabase";

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  booking_id?: string | null;
  payment_id?: string | null;
  is_read: boolean;
  created_at: string;
}

/**
 * Create a notification for a user.
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  bookingId?: string,
  paymentId?: string
): Promise<Notification | null> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .insert([
        {
          user_id: userId,
          type,
          title,
          message,
          booking_id: bookingId ?? null,
          payment_id: paymentId ?? null,
          is_read: false,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating notification:", error);
      return null;
    }

    return data as Notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    return null;
  }
}

/**
 * Get all notifications for a user.
 */
export async function getUserNotifications(
  userId: string
): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching notifications:", error);
      return [];
    }

    return (data || []) as Notification[];
  } catch (error) {
    console.error("Error getting notifications:", error);
    return [];
  }
}

/**
 * Get the number of unread notifications.
 */
export async function getUnreadNotificationCount(
  userId: string
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("Error getting unread notification count:", error);
      return 0;
    }

    return count ?? 0;
  } catch (error) {
    console.error("Error getting unread notification count:", error);
    return 0;
  }
}

/**
 * Mark one notification as read.
 */
export async function markNotificationAsRead(
  notificationId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (error) {
      console.error("Error marking notification as read:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return false;
  }
}

/**
 * Mark all notifications for a user as read.
 */
export async function markAllNotificationsAsRead(
  userId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      console.error("Error marking all notifications as read:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return false;
  }
}

/**
 * Create the notifications generated after a booking is secured in escrow.
 *
 * Customer:
 *   Payment is being held in escrow until service confirmation.
 *
 * Provider:
 *   New booking confirmed; funds are held by NINJAWO until completion.
 */
export async function createPaymentNotifications({
  customerId,
  providerUserId,
  bookingId,
  paymentId,
  amount,
}: {
  customerId: string;
  providerUserId: string;
  bookingId: string;
  paymentId: string;
  amount: number;
}): Promise<boolean> {
  try {
    const formattedAmount = Number(amount).toLocaleString();

    const [customerNotification, providerNotification] =
      await Promise.all([
        createNotification(
          customerId,
          "payment_escrowed",
          "Payment held in escrow",
          `Your payment of UGX ${formattedAmount} is being held by NINJAWO until you confirm the service is complete.`,
          bookingId,
          paymentId
        ),

        createNotification(
          providerUserId,
          "booking_confirmed",
          "New booking confirmed",
          `A new booking worth UGX ${formattedAmount} has been secured. Funds are held by NINJAWO until the customer confirms completion.`,
          bookingId,
          paymentId
        ),
      ]);

    return Boolean(customerNotification && providerNotification);
  } catch (error) {
    console.error("Error creating payment notifications:", error);
    return false;
  }
}