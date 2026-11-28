import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Landing from './pages/Landing.jsx';
import Register from './pages/Register.jsx';
import Login from './pages/Login.jsx';
import Verify from './pages/Verify.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Home from './pages/Home.jsx';
import Profile from './pages/Profile.jsx';
import FollowList from './pages/FollowList.jsx';
import Settings from './pages/Settings.jsx';
import PostDetail from './pages/PostDetail.jsx';
import Groups from './pages/Groups.jsx';
import GroupDetail from './pages/GroupDetail.jsx';
import GroupRequests from './pages/GroupRequests.jsx';
import Library from './pages/Library.jsx';
import DocumentNew from './pages/DocumentNew.jsx';
import DocumentDetail from './pages/DocumentDetail.jsx';
import Study from './pages/Study.jsx';
import StudyStats from './pages/StudyStats.jsx';
import Teamups from './pages/Teamups.jsx';
import TeamupDetail from './pages/TeamupDetail.jsx';
import Notifications from './pages/Notifications.jsx';
import Search from './pages/Search.jsx';
import Admin from './pages/Admin.jsx';
import NotFound from './pages/NotFound.jsx';

// Đường dẫn theo SRS mục 7.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/home" element={<Home />} />
          <Route path="/u/:id" element={<Profile />} />
          <Route path="/u/:id/followers" element={<FollowList key="followers" tab="followers" />} />
          <Route path="/u/:id/following" element={<FollowList key="following" tab="following" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/posts/:id" element={<PostDetail />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/groups/:id/requests" element={<GroupRequests />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/new" element={<DocumentNew />} />
          <Route path="/library/:id" element={<DocumentDetail />} />
          <Route path="/study" element={<Study />} />
          <Route path="/study/stats" element={<StudyStats />} />
          <Route path="/teamups" element={<Teamups />} />
          <Route path="/teamups/:id" element={<TeamupDetail />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/search" element={<Search />} />
          <Route path="/admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
