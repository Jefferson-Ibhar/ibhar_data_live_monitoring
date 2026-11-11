import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { MonitoringProvider } from './hooks/useMonitoring';

// Layout
import { SmoothScroll } from './components/layout/SmoothScroll';
import { MainLayout } from './components/layout/MainLayout';

// Pages
import { LoginPage } from './pages/Login/LoginPage';
import { DashboardPage } from './pages/Dashboard/DashboardPage';
import { LivePage } from './pages/Live/LivePage';
import { HospitalsPage } from './pages/Hospitals/HospitalsPage';
import { HospitalDetailsPage } from './pages/HospitalDetails/HospitalDetailsPage';
import { AlertsPage } from './pages/Alerts/AlertsPage';
import { AnalyticsPage } from './pages/Analytics/AnalyticsPage';
import { HospitalComparisonPage } from './pages/HospitalComparison/HospitalComparisonPage';
import { IntegrationHealthPage } from './pages/IntegrationHealth/IntegrationHealthPage';
import { AwsCostsPage } from './pages/AwsCosts/AwsCostsPage';
import { NotificationsPage } from './pages/Notifications/NotificationsPage';
import { MorePage } from './pages/More/MorePage';
import { ProfilePage } from './pages/Profile/ProfilePage';
import { UserManagementPage } from './pages/UserManagement/UserManagementPage';
import { RoleManagementPage } from './pages/RoleManagement/RoleManagementPage';
import { NotificationSettingsPage } from './pages/NotificationSettings/NotificationSettingsPage';
import { RefreshSettingsPage } from './pages/RefreshSettings/RefreshSettingsPage';
import { HospitalRefreshRatePage } from './pages/HospitalRefreshRate/HospitalRefreshRatePage';
import { HelpSupportPage } from './pages/HelpSupport/HelpSupportPage';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <MonitoringProvider>
        <BrowserRouter>
          <SmoothScroll>
          <Routes>
            {/* Auth Page */}
            <Route path="/login" element={<LoginPage />} />

            {/* Application Main Layout */}
            <Route path="/" element={<MainLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="live" element={<LivePage />} />
              <Route path="hospitals" element={<HospitalsPage />} />
              <Route path="hospitals/:id" element={<HospitalDetailsPage />} />
              <Route path="alerts" element={<AlertsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="aws-costs" element={<AwsCostsPage />} />
              <Route path="integration-health" element={<IntegrationHealthPage />} />
              <Route path="comparison" element={<HospitalComparisonPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="settings" element={<MorePage />} />
              <Route path="more" element={<MorePage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="user-management" element={<UserManagementPage />} />
              <Route path="role-management" element={<RoleManagementPage />} />
              <Route path="notification-settings" element={<NotificationSettingsPage />} />
              <Route path="refresh-settings" element={<RefreshSettingsPage />} />
              <Route path="hospital-refresh-rate" element={<HospitalRefreshRatePage />} />
              <Route path="about" element={<RefreshSettingsPage />} />
              <Route path="help-support" element={<HelpSupportPage />} />
            </Route>

            {/* Fallback Route */}
            <Route path="*" element={<DashboardPage />} />
          </Routes>
          </SmoothScroll>
        </BrowserRouter>
      </MonitoringProvider>
    </ThemeProvider>
  );
};

export default App;
