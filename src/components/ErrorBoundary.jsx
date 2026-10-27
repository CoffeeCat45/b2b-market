import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Ошибка интерфейса:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="empty-state card">
            <h1>Что-то пошло не так</h1>
            <p>Обновите страницу, чтобы вернуться к работе.</p>
            <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
