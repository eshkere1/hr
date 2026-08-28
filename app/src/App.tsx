import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout, HOME_BY_ROLE } from "@/components/app/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui";
import type { AppRole } from "@/lib/types";

import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Pipeline from "@/pages/Pipeline";
import ApplicationCard from "@/pages/ApplicationCard";
import Vacancies, { VacancyCard } from "@/pages/Vacancies";
import Candidates from "@/pages/Candidates";
import Inbox from "@/pages/Inbox";
import Documents from "@/pages/Documents";
import WaitingForMe from "@/pages/WaitingForMe";
import Requisitions, { RequisitionNew } from "@/pages/Requisitions";
import MyStatus, { MyDocuments } from "@/pages/CandidatePortal";
import { Admin, Analytics, MyProfile, NotFound } from "@/pages/Misc";

/**
 * Защита маршрута.
 *
 * Это удобство, а не безопасность: настоящее ограничение стоит в RLS.
 * Даже если кто-то обойдёт роутер, база вернёт пустой ответ.
 */
function RoleGate({ roles, children }: { roles: AppRole[]; children: JSX.Element }) {
  const { can, primaryRole } = useAuth();
  if (!can(...roles)) {
    return <Navigate to={primaryRole ? HOME_BY_ROLE[primaryRole] : "/auth"} replace />;
  }
  return children;
}

function Home() {
  const { primaryRole } = useAuth();
  return <Navigate to={primaryRole ? HOME_BY_ROLE[primaryRole] : "/auth"} replace />;
}

export default function App() {
  const { loading, userId } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[1000px] flex-col gap-4 p-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!userId) {
    return (
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={<Home />} />

      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />

        <Route
          path="/dashboard"
          element={
            <RoleGate roles={["director", "superuser"]}>
              <Dashboard />
            </RoleGate>
          }
        />
        <Route
          path="/pipeline"
          element={
            <RoleGate roles={["hr_manager", "director", "superuser", "employee"]}>
              <Pipeline />
            </RoleGate>
          }
        />
        <Route
          path="/waiting"
          element={
            <RoleGate roles={["dept_head", "line_manager", "superuser"]}>
              <WaitingForMe />
            </RoleGate>
          }
        />

        <Route
          path="/vacancies"
          element={
            <RoleGate roles={["director", "hr_manager", "dept_head", "line_manager", "superuser"]}>
              <Vacancies />
            </RoleGate>
          }
        />
        <Route
          path="/vacancies/:id"
          element={
            <RoleGate roles={["director", "hr_manager", "dept_head", "line_manager", "superuser"]}>
              <VacancyCard />
            </RoleGate>
          }
        />

        <Route
          path="/applications/:id"
          element={
            <RoleGate roles={["director", "hr_manager", "dept_head", "line_manager", "superuser"]}>
              <ApplicationCard />
            </RoleGate>
          }
        />

        <Route
          path="/requisitions"
          element={
            <RoleGate roles={["director", "superuser"]}>
              <Requisitions />
            </RoleGate>
          }
        />
        <Route
          path="/requisitions/new"
          element={
            <RoleGate roles={["dept_head", "line_manager", "hr_manager", "superuser"]}>
              <RequisitionNew />
            </RoleGate>
          }
        />

        <Route
          path="/candidates"
          element={
            <RoleGate roles={["hr_manager", "director", "superuser"]}>
              <Candidates />
            </RoleGate>
          }
        />
        <Route
          path="/inbox"
          element={
            <RoleGate roles={["hr_manager", "superuser"]}>
              <Inbox />
            </RoleGate>
          }
        />
        <Route
          path="/documents"
          element={
            <RoleGate roles={["hr_manager", "director", "superuser"]}>
              <Documents />
            </RoleGate>
          }
        />
        <Route
          path="/analytics"
          element={
            <RoleGate roles={["director", "hr_manager", "superuser"]}>
              <Analytics />
            </RoleGate>
          }
        />

        <Route
          path="/me"
          element={
            <RoleGate roles={["employee", "superuser", "line_manager"]}>
              <MyProfile />
            </RoleGate>
          }
        />
        <Route
          path="/my-status"
          element={
            <RoleGate roles={["candidate", "superuser"]}>
              <MyStatus />
            </RoleGate>
          }
        />
        <Route
          path="/my-documents"
          element={
            <RoleGate roles={["candidate", "superuser"]}>
              <MyDocuments />
            </RoleGate>
          }
        />

        <Route
          path="/admin"
          element={
            <RoleGate roles={["superuser"]}>
              <Admin />
            </RoleGate>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
