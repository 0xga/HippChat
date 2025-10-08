import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { ErrorBoundary } from '@/components/error-boundary';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { queryClient } from '@/lib/query-client';
import { useChatStore } from '@/lib/store';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // console.log('=== ROOT LAYOUT RENDERING ===');
  
  const colorScheme = useColorScheme();
  const { isAuthenticated, hasHydrated } = useChatStore();
  const [loaded] = useFonts({});

  useEffect(() => {
    // console.log('Layout useEffect triggered:', { loaded, isAuthenticated, hasHydrated });
    if (loaded && hasHydrated) {
      // console.log('Hiding splash screen...');
      SplashScreen.hideAsync();
    }
  }, [loaded, isAuthenticated, hasHydrated]);

  if (!loaded || !hasHydrated) {
    // console.log('Showing loading screen...');
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
        <Text style={{ fontSize: 18, color: '#333' }}>Loading...</Text>
      </View>
    );
  }

  // console.log('Rendering main app...');
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            {!isAuthenticated ? (
              <Stack.Screen name="login" options={{ headerShown: false }} />
            ) : (
              <>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              </>
            )}
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}