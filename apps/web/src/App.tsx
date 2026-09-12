import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { useSession } from "./stores/session";
import { LoginPage, RegisterPage, WelcomePage } from "./components/onboarding/AuthPages";
import { Shell } from "./components/layout/Shell";
import { Inbox } from "./components/inbox/Inbox";
import { Chat } from "./components/chat/Chat";
import {
  SettingsLayout,
  ProfileSettings,
  AppearanceSettings,
  PrivacySettings,
  AdvancedSettings,
  WorkspaceSettings,
  ConnectionsSettings,
} from "./components/settings/Settings";
import { ContactsPage } from "./components/contacts/ContactsPage";

function Guard({ children }: { children: React.ReactNode }) {
  const { user, ready, load } = useSession();
  useEffect(() => {
    void load();
  }, [load]);
  if (!ready) return <div className="grid h-full place-items-center text-mist-500">Loading Impro…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/welcome"
        element={
          <Guard>
            <WelcomePage />
          </Guard>
        }
      />
      <Route
        path="/"
        element={
          <Guard>
            <Shell />
          </Guard>
        }
      >
        <Route element={<Inbox />}>
          <Route index element={null} />
          <Route path="c/:id" element={<Chat />} />
        </Route>
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactsPage />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<ProfileSettings />} />
          <Route path="appearance" element={<AppearanceSettings />} />
          <Route path="notifications" element={<ProfileSettings />} />
          <Route path="connections" element={<ConnectionsSettings />} />
          <Route path="privacy" element={<PrivacySettings />} />
          <Route path="security" element={<ProfileSettings />} />
          <Route path="workspaces" element={<WorkspaceSettings />} />
          <Route path="advanced" element={<AdvancedSettings />} />
        </Route>
      </Route>
    </Routes>
  );
}
