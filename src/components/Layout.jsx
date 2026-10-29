import Header from "./Header";
import Footer from "./Footer";
import ConnectionBanner from "./ConnectionBanner";
import DataRefreshNotice from "./DataRefreshNotice";

function Layout({ children, withFooter = true }) {
  return (
    <div className="page-shell">
      <Header />
      <div className="system-notices">
        <ConnectionBanner />
        <DataRefreshNotice />
      </div>
      <main>{children}</main>
      {withFooter ? <Footer /> : null}
    </div>
  );
}

export default Layout;
