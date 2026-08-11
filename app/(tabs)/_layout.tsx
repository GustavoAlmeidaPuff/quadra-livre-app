import { Tabs } from 'expo-router';
import AppTabBar from '@/components/AppTabBar';
import AppHeader from '@/components/AppHeader';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        header: () => <AppHeader />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Início' }} />
      <Tabs.Screen name="reservar" options={{ title: 'Reservar' }} />
      <Tabs.Screen name="social" options={{ title: 'Social' }} />
    </Tabs>
  );
}
