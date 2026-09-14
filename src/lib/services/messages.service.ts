import { supabase } from "../supabase";

export interface Message {
  id: string;
  provider_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
}

export interface InboxMessage extends Message {
  counterparty_name: string;
  counterparty_avatar_url?: string | null;
}

export async function sendMessage(providerId: string, body: string): Promise<Message | null> {
  const messageBody = body.trim();
  if (!messageBody) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to message a provider.");

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();
  if (providerError || !provider) throw new Error("Provider not found.");
  if (provider.user_id === user.id)
    throw new Error("You cannot message your own provider account.");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      provider_id: providerId,
      sender_id: user.id,
      recipient_id: provider.user_id,
      body: messageBody,
    })
    .select()
    .single();

  if (error) throw new Error(error.message || "Failed to send your message.");
  return data as Message;
}

export async function getInboxMessages(userId: string): Promise<InboxMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message || "Failed to load your conversations.");

  const providerIds = [...new Set((data || []).map((message) => message.provider_id))];
  if (!providerIds.length) return [];

  const { data: providers, error: providersError } = await supabase
    .from("providers")
    .select("id, user_id, business_name, profile_picture_url")
    .in("id", providerIds);
  if (providersError) throw new Error(providersError.message || "Failed to load providers.");

  const providerMap = new Map((providers || []).map((provider) => [provider.id, provider]));
  const userIds = [
    ...new Set((data || []).flatMap((message) => [message.sender_id, message.recipient_id])),
  ];
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", userIds);
  if (profilesError)
    throw new Error(profilesError.message || "Failed to load conversation participants.");
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const latestByProvider = new Map<string, Message>();
  for (const message of (data || []) as Message[]) {
    if (!latestByProvider.has(message.provider_id))
      latestByProvider.set(message.provider_id, message);
  }

  return [...latestByProvider.values()].map((message) => {
    const provider = providerMap.get(message.provider_id);
    const counterpartyId = message.sender_id === userId ? message.recipient_id : message.sender_id;
    const counterpartyProfile = profileMap.get(counterpartyId);
    const isProvider = provider?.user_id === counterpartyId;
    return {
      ...message,
      counterparty_name: isProvider
        ? provider?.business_name || "Provider"
        : counterpartyProfile?.full_name || "Customer",
      counterparty_avatar_url: isProvider
        ? provider?.profile_picture_url
        : counterpartyProfile?.avatar_url,
    };
  });
}

/**
 * Provider reply: send a message as the currently authenticated provider
 * to a customer participating in a conversation on that provider row.
 *
 * Mirrors sendMessage() but the sender is the provider and the recipient
 * is the customer. The existing sendMessage() is intentionally untouched.
 */
export async function sendReply({
  providerId,
  recipientId,
  body,
}: {
  providerId: string;
  recipientId: string;
  body: string;
}): Promise<Message | null> {
  const messageBody = body.trim();
  if (!messageBody) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to reply to a customer.");

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("user_id")
    .eq("id", providerId)
    .single();
  if (providerError || !provider) throw new Error("Provider not found.");
  if (provider.user_id !== user.id) {
    throw new Error("Only the provider who owns this account can reply.");
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      provider_id: providerId,
      sender_id: user.id,
      recipient_id: recipientId,
      body: messageBody,
    })
    .select()
    .single();

  if (error) throw new Error(error.message || "Failed to send your reply.");
  return data as Message;
}

export interface ConversationMessage extends Message {
  mine: boolean;
}

/**
 * Full thread for one conversation (grouped by provider row), in chat
 * order (oldest first). The caller must be a participant — enforced by
 * the filter below and by the messages RLS SELECT policy.
 */
export async function getConversationMessages(
  userId: string,
  providerId: string,
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("provider_id", providerId)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message || "Failed to load the conversation.");

  return ((data || []) as Message[]).map((message) => ({
    ...message,
    mine: message.sender_id === userId,
  }));
}
