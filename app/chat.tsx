import { useMessaging } from '@/lib/messaging';
import { Message } from '@/lib/s3';
import { useChatStore } from '@/lib/store';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

export default function ChatScreen() {
  const router = useRouter();
  const {
    selectedContact,
    contacts,
    messages,
    addMessage,
    addMessages,
    updateLastReadOffset,
    currentUser
  } = useChatStore();

  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inputHeight, setInputHeight] = useState(40);
  const flatListRef = useRef<FlatList>(null);
  const messaging = useMessaging();
  const pollOffsetRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDelayRef = useRef<number>(5000);
  const burstRemainingRef = useRef<number>(0);
  const sendButtonScale = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);

  const contact = contacts.find(c => c.address === selectedContact);
  const chatMessages = messages[selectedContact || ''] || [];

  useEffect(() => {
    isMountedRef.current = true;

    // Entrance animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedContact || !messaging) {
      return;
    }

    let cancelled = false;
    pollDelayRef.current = 3000;

    const schedule = (delay: number) => {
      if (cancelled || !isMountedRef.current) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(pollOnce, delay);
    };

    const pollOnce = async () => {
      if (cancelled || !selectedContact || !messaging || !isMountedRef.current) return;
      try {
        const newMessages = await messaging.pollMessages(selectedContact, pollOffsetRef.current);
        if (newMessages && newMessages.length > 0 && isMountedRef.current) {
          const existing = useChatStore.getState().messages[selectedContact] || [];
          const existingIds = new Set(existing.map(m => m.msg_id));
          const deduped = newMessages.filter(m => !existingIds.has(m.msg_id));
          if (deduped.length > 0) {
            addMessages(selectedContact, deduped);
            burstRemainingRef.current = Math.max(burstRemainingRef.current, 3);
          }
        }
        const latestOffset = (useChatStore.getState().lastReadOffsets[selectedContact] ?? pollOffsetRef.current);
        pollOffsetRef.current = latestOffset;
        pollDelayRef.current = 3000;
      } catch (error) {
        console.error('Failed to poll messages:', error);
        pollDelayRef.current = Math.floor(5000 + Math.random() * 1000);
      } finally {
        if (isMountedRef.current) {
          const delay = burstRemainingRef.current > 0 ? 1000 : pollDelayRef.current;
          if (burstRemainingRef.current > 0) burstRemainingRef.current -= 1;
          schedule(delay);
        }
      }
    };

    const initAndStart = async () => {
      if (cancelled || !isMountedRef.current) return;
      try {
        setIsLoading(true);
        const savedOffset = useChatStore.getState().lastReadOffsets[selectedContact];
        if (savedOffset == null) {
          try {
            await messaging.loadInitialHistory(selectedContact, 100);
          } catch (e) {
            console.error('Failed initial history load:', e);
          }
        }
        try {
          const lookbackMs = 10 * 60 * 1000;
          const hasIncoming = await messaging.hasRecentIncoming(selectedContact, lookbackMs);
          if (hasIncoming && isMountedRef.current) {
            const now = Date.now();
            const threshold = now - lookbackMs;
            const existing = useChatStore.getState().messages[selectedContact] || [];
            const presentInStore = existing.some(m => m.from === selectedContact && new Date(m.ts).getTime() >= threshold);
            if (!presentInStore) {
              try {
                await messaging.loadInitialHistory(selectedContact, 150);
              } catch (bfErr) {
                console.error('[chat-init] backfill after hasRecentIncoming failed:', bfErr);
              }
            }
            burstRemainingRef.current = Math.max(burstRemainingRef.current, 3);
          }
        } catch (e) {
          console.error('[chat-init] hasRecentIncoming failed:', e);
        }
        const startOffset = (useChatStore.getState().lastReadOffsets[selectedContact] ?? new Date().getTime());
        pollOffsetRef.current = startOffset;
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          schedule(0);
        }
      }
    };

    initAndStart();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [selectedContact, messaging]);

  const handleSendMessage = useCallback(async () => {
    if (!messageText.trim() || !selectedContact || isSending || !messaging) return;

    // Animate send button
    Animated.sequence([
      Animated.timing(sendButtonScale, {
        toValue: 0.85,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(sendButtonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    const messageContent = messageText.trim();
    setMessageText('');
    setInputHeight(40);
    setIsSending(true);
    Keyboard.dismiss();

    try {
      const message = await messaging.sendMessage({
        to: selectedContact,
        content: messageContent,
        type: 'text'
      });

      if (isMountedRef.current) {
        addMessage(selectedContact, message);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      if (isMountedRef.current) {
        setMessageText(messageContent);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSending(false);
      }
    }
  }, [messageText, selectedContact, isSending, messaging, sendButtonScale]);

  const formatMessageTime = (timestamp: string) => {
    const messageDate = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const shouldShowDateHeader = (currentMsg: Message, previousMsg?: Message) => {
    if (!previousMsg) return true;
    const currentDate = new Date(currentMsg.ts).toDateString();
    const previousDate = new Date(previousMsg.ts).toDateString();
    return currentDate !== previousDate;
  };

  const formatDateHeader = (timestamp: string) => {
    const messageDate = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return messageDate.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  const getAvatarColor = (name: string) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const renderMessage = useCallback(({ item, index }: { item: Message & { decryptedContent?: string }, index: number }) => {
    const isOwn = item.from === currentUser?.ss58Address;
    const content = item.decryptedContent || 'Unable to decrypt';
    const previousMsg = index > 0 ? chatMessages[index - 1] : undefined;
    const showDateHeader = shouldShowDateHeader(item, previousMsg);
    const nextMsg = index < chatMessages.length - 1 ? chatMessages[index + 1] : undefined;
    const isLastInGroup = !nextMsg || nextMsg.from !== item.from ||
      (new Date(nextMsg.ts).getTime() - new Date(item.ts).getTime()) > 60000;

    return (
      <>
        {showDateHeader && (
          <View style={styles.dateHeaderContainer}>
            <View style={styles.dateHeader}>
              <Text style={styles.dateHeaderText}>{formatDateHeader(item.ts)}</Text>
            </View>
          </View>
        )}
        <View style={[styles.messageContainer, isOwn ? styles.ownMessage : styles.otherMessage]}>
          {!isOwn && isLastInGroup && (
            <View style={styles.avatarContainer}>
              {contact?.avatarUrl ? (
                <Image source={{ uri: contact.avatarUrl }} style={styles.messageAvatar} />
              ) : (
                <View style={[styles.messageAvatarPlaceholder, { backgroundColor: getAvatarColor(contact?.displayName || 'U') }]}>
                  <Text style={styles.messageAvatarText}>{contact?.displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
          )}
          {!isOwn && !isLastInGroup && <View style={styles.avatarSpacer} />}

          <View style={[
            styles.messageBubble,
            isOwn ? styles.ownBubble : styles.otherBubble,
            isLastInGroup && (isOwn ? styles.ownBubbleLast : styles.otherBubbleLast)
          ]}>
            <Text style={[styles.messageText, isOwn ? styles.ownMessageText : styles.otherMessageText]}>
              {content}
            </Text>
            <View style={styles.messageFooter}>
              <Text style={[styles.messageTime, isOwn ? styles.ownMessageTime : styles.otherMessageTime]}>
                {formatMessageTime(item.ts)}
              </Text>
              {isOwn && (
                <Ionicons name="checkmark-done" size={16} color="rgba(255, 255, 255, 0.7)" style={styles.checkmark} />
              )}
            </View>
          </View>
        </View>
      </>
    );
  }, [chatMessages, currentUser, contact]);

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Text style={styles.emptyIconText}>💬</Text>
      </View>
      <Text style={styles.emptyTitle}>No messages yet</Text>
      <Text style={styles.emptySubtitle}>
        Start the conversation with {contact?.displayName}
      </Text>
    </View>
  ), [contact]);

  if (!contact || !currentUser) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>Contact not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.errorButton} activeOpacity={0.7}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.contactInfoButton} activeOpacity={0.7}>
          <View style={styles.contactInfo}>
            {contact.avatarUrl ? (
              <Image source={{ uri: contact.avatarUrl }} style={styles.headerAvatar} />
            ) : (
              <View style={[styles.headerAvatarPlaceholder, { backgroundColor: getAvatarColor(contact.displayName) }]}>
                <Text style={styles.headerAvatarText}>{contact.displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.contactTextInfo}>
              <Text style={styles.contactName} numberOfLines={1}>{contact.displayName}</Text>
              <View style={styles.statusContainer}>
                <View style={styles.statusDot} />
                <Text style={styles.contactStatus}>Online</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionButton} activeOpacity={0.6}>
            <Ionicons name="call-outline" size={22} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionButton} activeOpacity={0.6}>
            <Ionicons name="ellipsis-vertical" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Messages */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={chatMessages}
          keyExtractor={(item) => item.msg_id}
          renderItem={renderMessage}
          style={styles.messagesList}
          contentContainerStyle={[styles.messagesContainer, chatMessages.length === 0 && styles.messagesContainerEmpty]}
          ListEmptyComponent={renderEmpty}
          onContentSizeChange={() => {
            if (chatMessages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onLayout={() => {
            if (chatMessages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
          showsVerticalScrollIndicator={false}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      )}

      {/* Input */}
      <Animated.View style={[styles.inputWrapper, { opacity: fadeAnim }]}>
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.attachButton} activeOpacity={0.6}>
            <Ionicons name="add-circle" size={28} color="#007AFF" />
          </TouchableOpacity>

          <View style={styles.textInputContainer}>
            <TextInput
              style={[styles.textInput, { height: Math.max(40, inputHeight) }]}
              value={messageText}
              onChangeText={setMessageText}
              onContentSizeChange={(e) => {
                const height = e.nativeEvent.contentSize.height;
                setInputHeight(Math.min(Math.max(40, height), 100));
              }}
              placeholder="Message"
              placeholderTextColor="#8E8E93"
              multiline
              maxLength={1000}
              returnKeyType="send"
              blurOnSubmit={false}
            />
          </View>

          {messageText.trim().length > 0 ? (
            <Animated.View style={{ transform: [{ scale: sendButtonScale }] }}>
              <TouchableOpacity
                style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={isSending}
                activeOpacity={0.7}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="send" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <TouchableOpacity style={styles.voiceButton} activeOpacity={0.6}>
              <Ionicons name="mic-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E5DDD5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0.5,
    borderBottomColor: '#C6C6C8',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfoButton: {
    flex: 1,
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  contactTextInfo: {
    marginLeft: 12,
    flex: 1,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 6,
  },
  contactStatus: {
    fontSize: 13,
    color: '#8E8E93',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 8,
  },
  messagesContainerEmpty: {
    flexGrow: 1,
  },
  dateHeaderContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  dateHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#667781',
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingHorizontal: 4,
  },
  ownMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    marginRight: 8,
    marginTop: 4,
  },
  avatarSpacer: {
    width: 32,
    marginRight: 8,
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  messageAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  messageBubble: {
    maxWidth: width * 0.75,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ownBubble: {
    backgroundColor: '#DCF8C6',
    borderBottomRightRadius: 2,
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  ownBubbleLast: {
    borderBottomRightRadius: 8,
  },
  otherBubbleLast: {
    borderBottomLeftRadius: 8,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  ownMessageText: {
    color: '#000000',
  },
  otherMessageText: {
    color: '#000000',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    justifyContent: 'flex-end',
  },
  messageTime: {
    fontSize: 11,
    fontWeight: '400',
  },
  ownMessageTime: {
    color: '#667781',
  },
  otherMessageTime: {
    color: '#667781',
  },
  checkmark: {
    marginLeft: 4,
  },
  inputWrapper: {
    backgroundColor: '#F0F0F0',
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 28 : 6,
    paddingHorizontal: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  attachButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  textInputContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  textInput: {
    fontSize: 16,
    color: '#000000',
    maxHeight: 100,
    padding: 0,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  voiceButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIconText: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#667781',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#E5DDD5',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#667781',
    marginTop: 16,
  },
});