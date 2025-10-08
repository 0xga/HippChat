import MessageBox from '@/components/MessageBox';
import { useMessaging } from '@/lib/messaging';
import { useChatStore } from '@/lib/store';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function ProfileScreen() {
  const { currentUser, logout } = useChatStore();
  const [displayName, setDisplayName] = useState('Anonymous');
  const [about, setAbout] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const messaging = useMessaging();
  const router = useRouter();
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const successAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        if (!currentUser || !messaging) return;
        const existing = await messaging.getUserProfile(currentUser.ss58Address);
        if (!isMounted || !existing) return;
        if (existing.displayName) setDisplayName(existing.displayName);
        if (existing.about) setAbout(existing.about);
      } catch (e) {
        console.error('Failed to load existing profile:', e);
      } finally {
        if (isMounted) setIsProfileLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.ss58Address, messaging]);

  const handleSaveProfile = async () => {
    if (!currentUser || !messaging) return;

    Keyboard.dismiss();
    setIsSaving(true);
    try {
      await messaging.updateUserProfile({
        v: 1,
        address: currentUser.ss58Address,
        displayName,
        pk: Buffer.from(currentUser.pk).toString('hex'),
        about,
        updatedAt: new Date().toISOString()
      });
      setIsEditing(false);

      // Show success animation
      setShowSuccessMessage(true);
      Animated.sequence([
        Animated.timing(successAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(successAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setShowSuccessMessage(false));
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    Keyboard.dismiss();
    setIsEditing(false);
    // Reset to original values if needed
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
    router.replace('/login');
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  const getAvatarColor = (name: string) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const copyToClipboard = (text: string, label: string) => {
    // In a real app, you'd use Clipboard.setString(text)
    console.log(`Copied ${label}: ${text}`);
  };

  if (!currentUser) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>🔒</Text>
        <Text style={styles.errorTitle}>Not Authenticated</Text>
        <Text style={styles.errorText}>Please sign in to view your profile</Text>
      </View>
    );
  }

  if (isProfileLoading) {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <ScrollView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Profile</Text>
            <View style={[styles.headerButton, { opacity: 0.6 }]}>
              <Text style={styles.logoutIcon}>🚪</Text>
            </View>
          </View>

          <View style={styles.profileContainer}>
            <View style={styles.avatarSection}>
              <SkeletonCircle size={100} />
              <View style={{ height: 16 }} />
              <SkeletonLine width={120} height={20} />
              <View style={{ height: 8 }} />
              <SkeletonLine width={200} height={14} />
            </View>

            <View style={styles.infoSection}>
              <SkeletonField />
              <SkeletonField />
              <SkeletonField />
              <SkeletonField />
            </View>
          </View>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
            <Text style={styles.title}>Profile</Text>
            <TouchableOpacity onPress={handleLogout} style={styles.headerButton}>
              <Text style={styles.logoutIcon}>🚪</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={[styles.profileContainer, { opacity: fadeAnim }]}>
            {/* Avatar Section */}
            <View style={styles.avatarSection}>
              <View style={[styles.avatarLarge, { backgroundColor: getAvatarColor(displayName) }]}>
                <Text style={styles.avatarLargeText}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.profileName}>{displayName}</Text>
              <Text style={styles.profileSubtext}>
                {about || 'No description yet'}
              </Text>
            </View>

            {/* Info Cards */}
            <View style={styles.infoSection}>
              {/* Display Name */}
              <View style={styles.infoCard}>
                <View style={styles.infoCardHeader}>
                  <Text style={styles.infoCardIcon}>👤</Text>
                  <Text style={styles.infoCardLabel}>Display Name</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={styles.textInput}
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Enter your name"
                    placeholderTextColor="#9CA3AF"
                  />
                ) : (
                  <Text style={styles.infoCardValue}>{displayName}</Text>
                )}
              </View>

              {/* About */}
              <View style={styles.infoCard}>
                <View style={styles.infoCardHeader}>
                  <Text style={styles.infoCardIcon}>📝</Text>
                  <Text style={styles.infoCardLabel}>About</Text>
                </View>
                {isEditing ? (
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    value={about}
                    onChangeText={setAbout}
                    placeholder="Tell something about yourself"
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                ) : (
                  <Text style={styles.infoCardValue}>
                    {about || 'No description'}
                  </Text>
                )}
              </View>

              {/* Address */}
              <View style={styles.infoCard}>
                <View style={styles.infoCardHeader}>
                  <Text style={styles.infoCardIcon}>🔑</Text>
                  <Text style={styles.infoCardLabel}>Address</Text>
                </View>
                <View style={styles.copyableField}>
                  <Text style={styles.infoCardValueMono} numberOfLines={1}>
                    {currentUser.ss58Address}
                  </Text>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={() => copyToClipboard(currentUser.ss58Address, 'Address')}
                  >
                    <Text style={styles.copyButtonText}>📋</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Public Key */}
              <View style={styles.infoCard}>
                <View style={styles.infoCardHeader}>
                  <Text style={styles.infoCardIcon}>🔐</Text>
                  <Text style={styles.infoCardLabel}>Public Key</Text>
                </View>
                <View style={styles.copyableField}>
                  <Text style={styles.infoCardValueMono} numberOfLines={2}>
                    {Buffer.from(currentUser.pk).toString('hex')}
                  </Text>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={() => copyToClipboard(Buffer.from(currentUser.pk).toString('hex'), 'Public Key')}
                  >
                    <Text style={styles.copyButtonText}>📋</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              {isEditing ? (
                <View style={styles.editButtons}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={handleCancel}
                    disabled={isSaving}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.saveButton, isSaving && styles.buttonDisabled]}
                    onPress={handleSaveProfile}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                        <Text style={styles.buttonIcon}>✓</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.button, styles.editButton]}
                  onPress={() => setIsEditing(true)}
                >
                  <Text style={styles.editButtonText}>Edit Profile</Text>
                  <Text style={styles.buttonIcon}>✏️</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Security Badge */}
            <View style={styles.securityBadge}>
              <Text style={styles.securityIcon}>🔒</Text>
              <Text style={styles.securityText}>
                Your profile is encrypted and secure
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success Message */}
      {showSuccessMessage && (
        <Animated.View
          style={[
            styles.successMessage,
            {
              opacity: successAnim,
              transform: [{
                translateY: successAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-20, 0],
                }),
              }],
            }
          ]}
        >
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successText}>Profile updated successfully!</Text>
        </Animated.View>
      )}

      <MessageBox
        visible={showLogoutModal}
        title="Sign Out"
        message="Are you sure you want to sign out of your account?"
        confirmText="Sign Out"
        cancelText="Cancel"
        confirmButtonColor="#FF3B30"
        onConfirm={confirmLogout}
        onCancel={cancelLogout}
      />
    </>
  );
}

function usePulse() {
  const opacity = React.useRef(new Animated.Value(0.3)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
}

function SkeletonLine({ width = 200, height = 14 }: { width?: number; height?: number }) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{ width, height, borderRadius: 8, backgroundColor: '#E5E7EB', opacity, marginBottom: 8 }}
    />
  );
}

function SkeletonCircle({ size = 50 }: { size?: number }) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#E5E7EB', opacity }}
    />
  );
}

function SkeletonField() {
  return (
    <View style={styles.infoCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <SkeletonCircle size={24} />
        <View style={{ width: 12 }} />
        <SkeletonLine width={100} height={14} />
      </View>
      <SkeletonLine width={250} height={16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F8F9FA',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutIcon: {
    fontSize: 20,
  },
  profileContainer: {
    padding: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  avatarLarge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  avatarLargeText: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '700',
  },
  profileName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  profileSubtext: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  infoSection: {
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoCardIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  infoCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCardValue: {
    fontSize: 16,
    color: '#1A1A1A',
    lineHeight: 24,
  },
  infoCardValueMono: {
    fontSize: 13,
    color: '#1A1A1A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
    flex: 1,
  },
  copyableField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyButton: {
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  copyButtonText: {
    fontSize: 16,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#F9FAFB',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  buttonContainer: {
    marginTop: 8,
    marginBottom: 24,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  editButton: {
    backgroundColor: '#007AFF',
    ...Platform.select({
      ios: {
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#10B981',
    ...Platform.select({
      ios: {
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonIcon: {
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  securityIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  securityText: {
    fontSize: 13,
    color: '#1E40AF',
    fontWeight: '500',
  },
  successMessage: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 80,
    left: 20,
    right: 20,
    backgroundColor: '#10B981',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  successIcon: {
    fontSize: 20,
    color: '#fff',
    marginRight: 12,
    fontWeight: 'bold',
  },
  successText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});