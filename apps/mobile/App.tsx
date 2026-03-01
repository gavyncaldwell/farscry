import React from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {AuthProvider} from './src/stores/authStore';
import {ContactsProvider} from './src/stores/contactsStore';
import {CallProvider} from './src/stores/callStore';
import {RootNavigator} from './src/navigation/RootNavigator';
import {colors} from './src/theme/colors';

const navTheme = {
  dark: true,
  colors: {
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
  fonts: {
    regular: {fontFamily: 'System', fontWeight: '400' as const},
    medium: {fontFamily: 'System', fontWeight: '500' as const},
    bold: {fontFamily: 'System', fontWeight: '700' as const},
    heavy: {fontFamily: 'System', fontWeight: '900' as const},
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <AuthProvider>
        <ContactsProvider>
          <SafeAreaProvider>
            <StatusBar barStyle="light-content" backgroundColor={colors.background} />
            <NavigationContainer theme={navTheme}>
              <CallProvider>
                <RootNavigator />
              </CallProvider>
            </NavigationContainer>
          </SafeAreaProvider>
        </ContactsProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
