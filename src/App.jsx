import { Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import OrdersPage from "./pages/OrdersPage";
import SuppliersPage from "./pages/SuppliersPage";
import ListingPage from "./pages/ListingPage";
import CompanyPage from "./pages/CompanyPage";
import CreatePage from "./pages/CreatePage";
import CreateOrderPage from "./pages/CreateOrderPage";
import ChatsPage from "./pages/ChatsPage";
import LoginPage from "./pages/LoginPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/suppliers" element={<SuppliersPage />} />
      <Route path="/listing/:id" element={<ListingPage />} />
      <Route path="/company/:id" element={<CompanyPage />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/create/order" element={<CreateOrderPage />} />
      <Route path="/chats" element={<ChatsPage />} />
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}

export default App;
