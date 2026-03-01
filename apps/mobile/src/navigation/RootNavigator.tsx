import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useAuth} from '../stores/authStore';
import {MainTabs} from './MainTabs';
import {LoginScreen} from '../screens/auth/LoginScreen';
import {SignupScreen} from '../screens/auth/SignupScreen';
import {OnboardingScreen} from '../screens/auth/OnboardingScreen';
import {IncomingCallScreen} from '../screens/call/IncomingCallScreen';
import {OutgoingCallScreen} from '../screens/call/OutgoingCallScreen';
import {ActiveCallScreen} from '../screens/call/ActiveCallScreen';
import {AddContactScreen} from '../screens/contacts/AddContactScreen';
import {ContactDetailScreen} from '../screens/contacts/ContactDetailScreen';
import {colors} from '../theme/colors';
import type {RootStackParamList, AuthStackParamList} from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: colors.background},
      }}>
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const {user, loading} = useAuth();

  if (loading) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background}}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: colors.background},
      }}>
      {user ? (
        <>
          <RootStack.Screen name="Main" component={MainTabs} />
          <RootStack.Group
            screenOptions={{
              presentation: 'fullScreenModal',
              animation: 'fade',
            }}>
            <RootStack.Screen name="IncomingCall" component={IncomingCallScreen} />
            <RootStack.Screen name="OutgoingCall" component={OutgoingCallScreen} />
            <RootStack.Screen name="ActiveCall" component={ActiveCallScreen} />
          </RootStack.Group>
          <RootStack.Group screenOptions={{presentation: 'card'}}>
            <RootStack.Screen
              name="AddContact"
              component={AddContactScreen}
              options={{
                headerShown: true,
                headerStyle: {backgroundColor: colors.background},
                headerTintColor: colors.text,
                title: 'Add Contact',
              }}
            />
            <RootStack.Screen
              name="ContactDetail"
              component={ContactDetailScreen}
              options={{
                headerShown: true,
                headerStyle: {backgroundColor: colors.background},
                headerTintColor: colors.text,
                title: '',
              }}
            />
          </RootStack.Group>
        </>
      ) : (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      )}
    </RootStack.Navigator>
  );
}
