import { deriveKeysFromSeed, hippiusCredentialsFromKeyPair } from '@/lib/crypto';
import { ensureUserStorage, makeS3Client } from '@/lib/s3';
import { useChatStore } from '@/lib/store';
import { getTestUsers } from '@/lib/test-users';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [testUsers, setTestUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(50)).current;

  const router = useRouter();
  const { login, setError, error } = useChatStore();

  const config = Constants.expoConfig?.extra;
  const s3Endpoint = config?.hippS3Endpoint || 'https://your-hippius-s3-endpoint.com';

  React.useEffect(() => {
    const users = getTestUsers();
    setTestUsers(users);

    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleTestUserLogin = async (testUser: any) => {
    setIsLoading(true);
    setSelectedUser(testUser.ss58Address);

    try {
      const keyPair = deriveKeysFromSeed(testUser.seed, testUser.ss58Address);
      const credentials = hippiusCredentialsFromKeyPair(keyPair);

      const s3Client = makeS3Client({
        endpoint: s3Endpoint,
        ...credentials
      });

      await ensureUserStorage(s3Client, `chat-${keyPair.ss58Address}`);
      const messaging = new (await import('@/lib/messaging')).MessagingService(s3Client, keyPair);
      await ensureUserStorage(s3Client, `profile-${keyPair.ss58Address}`);

      const existingProfile = await messaging.getUserProfile(keyPair.ss58Address);
      if (!existingProfile) {
        await messaging.updateUserProfile({
          v: 1,
          address: keyPair.ss58Address,
          displayName: testUser.displayName,
          pk: Buffer.from(keyPair.pk).toString('hex'),
          avatarUrl: testUser.avatarUrl,
          about: testUser.about,
          updatedAt: new Date().toISOString()
        });
      }

      login(keyPair, s3Client);
      router.replace('/(tabs)/contacts');
    } catch (error) {
      console.error('Test user login error:', error);
      setError('Failed to login. Please try again.');
      setSelectedUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const getAvatarColor = (name: string) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.header,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <View style={styles.logoContainer}>
              <View style={styles.logo}>
                <Text style={styles.logoText}>💬</Text>
              </View>
            </View>
            <Text style={styles.title}>Welcome to HippChat</Text>
            <Text style={styles.subtitle}>
              Secure end-to-end encrypted messaging
            </Text>
          </Animated.View>

          {error && (
            <Animated.View
              style={[styles.errorContainer, { opacity: fadeAnim }]}
            >
              <View style={styles.errorContent}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setError(null)}
                style={styles.errorCloseButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.errorCloseText}>×</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          <Animated.View
            style={[
              styles.testUsersContainer,
              { opacity: fadeAnim }
            ]}
          >
            <Text style={styles.sectionTitle}>Select Your Account</Text>
            <Text style={styles.sectionSubtitle}>Choose a profile to continue</Text>

            <View style={styles.usersList}>
              {testUsers.map((user, index) => {
                const isSelected = selectedUser === user.ss58Address;
                const isCurrentlyLoading = isLoading && isSelected;

                return (
                  <TouchableOpacity
                    key={user.ss58Address}
                    style={[
                      styles.userCard,
                      isSelected && styles.userCardSelected,
                      isLoading && !isSelected && styles.userCardDisabled
                    ]}
                    onPress={() => handleTestUserLogin(user)}
                    disabled={isLoading}
                    activeOpacity={0.7}
                  >
                    <View style={styles.userCardContent}>
                      <View
                        style={[
                          styles.avatar,
                          { backgroundColor: getAvatarColor(user.displayName) }
                        ]}
                      >
                        <Text style={styles.avatarText}>
                          {user.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{user.displayName}</Text>
                        <Text style={styles.userAddress}>
                          {user.ss58Address.slice(0, 12)}...{user.ss58Address.slice(-8)}
                        </Text>
                        {user.about && (
                          <Text style={styles.userAbout} numberOfLines={2}>
                            {user.about}
                          </Text>
                        )}
                      </View>

                      {isCurrentlyLoading ? (
                        <ActivityIndicator color="#007AFF" size="small" />
                      ) : (
                        <View style={styles.arrowContainer}>
                          <Text style={styles.arrow}>→</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              🔒 Your messages are end-to-end encrypted
            </Text>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  logoText: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    flex: 1,
    fontWeight: '500',
  },
  errorCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  errorCloseText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  testUsersContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  usersList: {
    gap: 12,
  },
  userCard: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  userCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F9FF',
  },
  userCardDisabled: {
    opacity: 0.4,
  },
  userCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  userAddress: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 6,
  },
  userAbout: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  arrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  arrow: {
    fontSize: 18,
    color: '#6B7280',
  },
  footer: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});