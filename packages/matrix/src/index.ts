/** MessagingProvider abstraction — UI never talks to Matrix SDK types directly. */
export type MessagingProvider = {
  sendText(conversationId: string, body: string): Promise<{ eventId: string }>;
};
