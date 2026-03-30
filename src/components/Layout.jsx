import Header from "./Header";
import Footer from "./Footer";

function Layout({ children, withFooter = true }) {
  return (
    <div className="page-shell">
      <Header />
      <main>{children}</main>
      {withFooter ? <Footer /> : null}
    </div>
  );
}

export default Layout;
