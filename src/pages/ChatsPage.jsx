import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

const ACCEPTED_FILES = ["application/pdf", "image/jpeg", "image/png"];
const CHAT_STATUS_OPTIONS = [
  { value: "negotiation", label: "В переговорах" },
  { value: "closed", label: "Закрыто" },
  { value: "archived", label: "В архиве" },
];
const CHAT_STATUS_LABELS = Object.fromEntries(CHAT_STATUS_OPTIONS.map((item) => [item.value, item.label]));

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatRequested(chat) {
  if (chat.orderTitle) {
    return [chat.orderTitle, chat.orderBudget, chat.orderSummary, chat.orderTerms].filter(Boolean).join("\n\n");
  }

  return chat.subject || "Обсуждение сотрудничества";
}

function formatOfferDetails({ price, timeline, comment }) {
  const parts = [];

  if (price.trim()) parts.push(`Цена: ${price.trim()}`);
  if (timeline.trim()) parts.push(`Сроки: ${timeline.trim()}`);
  if (comment.trim()) parts.push(`Комментарий: ${comment.trim()}`);

  return parts.join("\n");
}

function getLastMessagePreview(chat) {
  const lastMessage = chat.messages?.[chat.messages.length - 1];
  if (!lastMessage) return chat.contractTitle;
  if (lastMessage.text) return lastMessage.text;
  if (lastMessage.attachments?.length) return `Вложений: ${lastMessage.attachments.length}`;
  return chat.contractTitle;
}

function getChatBaseStatus(chat) {
  if (!chat) return "negotiation";
  const rawStatus = chat.lifecycleStatus || "active";
  return rawStatus === "active" ? "negotiation" : rawStatus;
}

function getChatStatusValue(chat) {
  if (!chat) return "negotiation";
  if (chat.isArchived) return "archived";
  return getChatBaseStatus(chat);
}

function getIntentParam(searchParams, key) {
  const directValue = searchParams.get(key);
  if (directValue) return directValue;

  const hash = window.location.hash || "";
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get(key);
}

function FileIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.48l9.2-9.2a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 1 1-2.82-2.83l8.48-8.48" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="m22 2-7 20-4-9-9-4Z" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function DetailsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </svg>
  );
}

function ChatsPage() {
  const { user, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(searchParams.get("chatId") || null);
  const [sidebarMode, setSidebarMode] = useState("active");
  const [messageDraft, setMessageDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [error, setError] = useState("");
  const [detailsStatus, setDetailsStatus] = useState("");
  const [agreementDraft, setAgreementDraft] = useState("");
  const [offeredDraft, setOfferedDraft] = useState("");
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerForm, setOfferForm] = useState({ price: "", timeline: "", comment: "" });
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() => window.innerWidth <= 820);
  const [mobileView, setMobileView] = useState("list");
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const openingChatRef = useRef("");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  const loadChats = useCallback(async () => {
    try {
      const chatData = await apiFetch("/chats");
      setChats(chatData);
      setError("");
      return chatData;
    } catch (loadError) {
      setError(loadError.message);
      return [];
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadChats();
    }
  }, [user, loadChats]);

  useEffect(() => {
    if (!user) return undefined;
    const intervalId = window.setInterval(() => {
      loadChats();
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [user, loadChats]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu);
    };
  }, []);

  useEffect(() => {
    if (!isMobileLayout) {
      setMobileView("list");
      return;
    }

    if (!selectedChatId) {
      setMobileView("list");
      return;
    }

    setMobileView((current) => (current === "list" ? "chat" : current));
  }, [isMobileLayout, selectedChatId]);

  useEffect(() => {
    const chatCompany = getIntentParam(searchParams, "chatCompany");
    const orderId = getIntentParam(searchParams, "orderId");
    if (!user?.companyId || !chatCompany) return undefined;

    const openKey = `${user.companyId}:${chatCompany}:${orderId || ""}`;
    if (openingChatRef.current === openKey) return undefined;
    openingChatRef.current = openKey;

    let cancelled = false;

    apiFetch("/chats/open", {
      method: "POST",
      body: JSON.stringify({
        companyId: chatCompany,
        orderId,
        subject: orderId ? `Отклик по объявлению ${orderId}` : "Обсуждение сотрудничества",
      }),
    })
      .then(async (data) => {
        if (cancelled) return;
        setSidebarMode("active");
        await loadChats();
        if (cancelled) return;
        setSelectedChatId(data.chatId);
        setSearchParams(data.chatId ? { chatId: data.chatId } : {});
      })
      .catch((openError) => {
        if (!cancelled) {
          setError(openError.message);
        }
      })
      .finally(() => {
        if (openingChatRef.current === openKey) {
          openingChatRef.current = "";
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, user, loadChats, setSearchParams]);

  const filteredChats = useMemo(
    () => chats.filter((chat) => (sidebarMode === "archived" ? chat.isArchived : !chat.isArchived)),
    [chats, sidebarMode],
  );

  const selectedChat = chats.find((chat) => chat.id === selectedChatId) || null;
  const baseStatusValue = getChatBaseStatus(selectedChat);
  const currentStatusValue = getChatStatusValue(selectedChat);
  const incomingStatusRequest = Boolean(selectedChat?.pendingStatus && user?.companyId && selectedChat.pendingStatusRequestedByCompanyId !== user.companyId);
  const outgoingStatusRequest = Boolean(selectedChat?.pendingStatus && user?.companyId && selectedChat.pendingStatusRequestedByCompanyId === user.companyId);

  useEffect(() => {
    setMessageDraft("");
    setPendingFiles([]);
    setDetailsStatus("");
    setAgreementDraft(selectedChat?.agreementDetails || "");
    setOfferedDraft(selectedChat?.offeredDetails || "");
    setOfferModalOpen(false);
    setOfferForm({ price: "", timeline: "", comment: "" });
    setContextMenu(null);
    setDeleteTargetId(null);
  }, [selectedChatId, selectedChat?.agreementDetails, selectedChat?.offeredDetails]);

  useEffect(() => {
    const chatCompany = getIntentParam(searchParams, "chatCompany");
    const orderId = getIntentParam(searchParams, "orderId");

    if (chatCompany && chats.length) {
      const matchedChat = chats.find((chat) => (
        chat.otherCompanyId === chatCompany && (orderId ? chat.orderId === orderId : true)
      ));

      if (matchedChat) {
        if (selectedChatId !== matchedChat.id) {
          setSelectedChatId(matchedChat.id);
        }
        setSidebarMode(matchedChat.isArchived ? "archived" : "active");
        setSearchParams({ chatId: matchedChat.id });
        return;
      }
    }

    if (!selectedChatId) return;
    if (openingChatRef.current || chatCompany) return;
    if (!chats.length) return;

    const existsInLoadedChats = chats.some((chat) => chat.id === selectedChatId);
    if (!existsInLoadedChats) {
      setSelectedChatId(null);
      setSearchParams({});
    }
  }, [chats, selectedChatId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedChatId || !selectedChat || !selectedChat.unreadCount || !user?.companyId) return;

    apiFetch(`/chats/${selectedChatId}/read`, { method: "POST" })
      .then(() => {
        setChats((current) => current.map((chat) => (
          chat.id === selectedChatId
            ? { ...chat, unreadCount: 0, lastReadAtIso: new Date().toISOString() }
            : chat
        )));
      })
      .catch(() => {});
  }, [selectedChatId, selectedChat, user]);

  useEffect(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(48, Math.min(textarea.scrollHeight, 220))}px`;
  }, [messageDraft, selectedChatId]);

  const firstUnreadIndex = useMemo(() => {
    if (!selectedChat || !user?.companyId || !selectedChat.messages?.length || !selectedChat.unreadCount) return -1;

    const lastReadTime = selectedChat.lastReadAtIso ? Date.parse(selectedChat.lastReadAtIso) : 0;

    return selectedChat.messages.findIndex((message) => (
      message.senderCompanyId !== user.companyId
      && Date.parse(message.createdAtIso || "") > lastReadTime
    ));
  }, [selectedChat, user]);

  const persistChatDetails = useCallback(async (chatId, nextOfferedDetails, nextAgreementDetails) => {
    await apiFetch(`/chats/${chatId}/details`, {
      method: "PUT",
      body: JSON.stringify({
        offeredDetails: nextOfferedDetails,
        agreementDetails: nextAgreementDetails,
      }),
    });
  }, []);

  const selectChat = (chatId) => {
    setContextMenu(null);
    setSelectedChatId(chatId);
    setSearchParams({ chatId });
    if (isMobileLayout) {
      setMobileView("chat");
    }
  };

  const clearSelection = () => {
    setContextMenu(null);
    setSelectedChatId(null);
    setSearchParams({});
    if (isMobileLayout) {
      setMobileView("list");
    }
  };

  const handlePickFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const supported = files.filter((file) => ACCEPTED_FILES.includes(file.type)).slice(0, 5);
      const nextFiles = await Promise.all(
        supported.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await readFileAsDataUrl(file),
        })),
      );
      setPendingFiles((current) => [...current, ...nextFiles].slice(0, 5));
      setError("");
    } catch {
      setError("Не удалось подготовить вложения.");
    } finally {
      event.target.value = "";
    }
  };

  const removePendingFile = (index) => {
    setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleChatContextMenu = (event, chat) => {
    event.preventDefault();
    setDeleteTargetId(null);
    setContextMenu({ chatId: chat.id, x: event.clientX, y: event.clientY, isArchived: chat.isArchived });
  };

  const deleteChat = async (chatId) => {
    try {
      await apiFetch(`/chats/${chatId}`, { method: "DELETE" });
      setContextMenu(null);
      setDeleteTargetId(null);
      if (selectedChatId === chatId) {
        setSelectedChatId(null);
        setSearchParams({});
      }
      await loadChats();
    } catch (deleteError) {
      setError(deleteError.message);
    }
  };

  const toggleArchive = async (chat, nextArchived) => {
    try {
      await apiFetch(`/chats/${chat.id}/archive`, {
        method: "PUT",
        body: JSON.stringify({ isArchived: nextArchived }),
      });
      setContextMenu(null);
      if (selectedChatId === chat.id) {
        setSelectedChatId(null);
        setSearchParams({});
      }
      await loadChats();
    } catch (archiveError) {
      setError(archiveError.message);
    }
  };

  const requestStatusChange = async (nextStatus) => {
    if (!selectedChat || !user?.companyId || statusBusy) return;

    if (nextStatus === "archived") {
      if (baseStatusValue !== "closed") {
        setError("Перенести чат в архив можно только после статуса Закрыто.");
        return;
      }

      try {
        setStatusBusy(true);
        setDetailsStatus("");
        await apiFetch(`/chats/${selectedChat.id}/archive`, {
          method: "PUT",
          body: JSON.stringify({ isArchived: true }),
        });
        setSidebarMode("archived");
        setDetailsStatus("Чат перенесён в ваш архив.");
        await loadChats();
      } catch (statusError) {
        setError(statusError.message);
      } finally {
        setStatusBusy(false);
      }
      return;
    }

    if (selectedChat.isArchived) {
      try {
        await apiFetch(`/chats/${selectedChat.id}/archive`, {
          method: "PUT",
          body: JSON.stringify({ isArchived: false }),
        });
      } catch (statusError) {
        setError(statusError.message);
        return;
      }
    }

    if (nextStatus === baseStatusValue && !selectedChat.pendingStatus) return;

    try {
      setStatusBusy(true);
      setDetailsStatus("");
      await apiFetch(`/chats/${selectedChat.id}/status-request`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      });
      setDetailsStatus(`Запрос на статус "${CHAT_STATUS_LABELS[nextStatus]}" отправлен.`);
      await loadChats();
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setStatusBusy(false);
    }
  };
  const respondToStatusRequest = async (accepted) => {
    if (!selectedChat || !selectedChat.pendingStatus || statusBusy) return;

    try {
      setStatusBusy(true);
      setDetailsStatus("");
      const pendingStatus = selectedChat.pendingStatus;
      await apiFetch(`/chats/${selectedChat.id}/status-request/respond`, {
        method: "POST",
        body: JSON.stringify({ accepted }),
      });
      if (accepted && pendingStatus === "archived") {
        setSidebarMode("archived");
      }
      setDetailsStatus(accepted ? "Статус обновлён для обеих компаний." : "Запрос на смену статуса отклонён.");
      await loadChats();
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setStatusBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedChat) return;
    if (!messageDraft.trim() && pendingFiles.length === 0) return;

    try {
      if (offeredDraft !== (selectedChat.offeredDetails || "") || agreementDraft !== (selectedChat.agreementDetails || "")) {
        await persistChatDetails(selectedChat.id, offeredDraft, agreementDraft);
      }

      await apiFetch(`/chats/${selectedChat.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: messageDraft.trim(), attachments: pendingFiles }),
      });
      setMessageDraft("");
      setPendingFiles([]);
      setDetailsStatus("");
      await loadChats();
    } catch (messageError) {
      setError(messageError.message);
    }
  };

  const saveDetails = async () => {
    if (!selectedChat) return;

    try {
      await persistChatDetails(selectedChat.id, offeredDraft, agreementDraft);
      setDetailsStatus("Детали чата сохранены.");
      await loadChats();
    } catch (saveError) {
      setError(saveError.message);
      setDetailsStatus("");
    }
  };

  const submitOffer = () => {
    const nextOfferedDetails = formatOfferDetails(offerForm);
    if (!nextOfferedDetails) {
      setError("Заполните хотя бы одно поле предложения.");
      return;
    }

    setOfferedDraft(nextOfferedDetails);
    setDetailsStatus("Предложение подготовлено. Оно сохранится вместе с сообщением или по кнопке ниже.");
    setOfferModalOpen(false);
    setOfferForm({ price: "", timeline: "", comment: "" });
  };

  const statusControl = (
    <div className="chat-status-control">
      <span className="chat-status-caption">Статус</span>
      {user?.companyId ? (
        <select
          className="chat-status-select"
          name="chatStatus"
          value={currentStatusValue}
          onChange={(event) => requestStatusChange(event.target.value)}
          disabled={statusBusy || Boolean(selectedChat?.pendingStatus)}
        >
          {CHAT_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} disabled={option.value === "archived" && !selectedChat?.isArchived && baseStatusValue !== "closed"}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="chat-status-chip">{CHAT_STATUS_LABELS[currentStatusValue]}</span>
      )}
    </div>
  );

  const showSidebar = !isMobileLayout || mobileView === "list";
  const showChat = !isMobileLayout || mobileView === "chat";
  const showDetails = !isMobileLayout || mobileView === "details";

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <Layout>
      <section className="chats-page-section">
        <div className="container">
          {error ? <div className="error-banner">{error}</div> : null}
          <div className={`chats-workspace ${isMobileLayout ? `mobile-view-${mobileView}` : ""}`}>
            <aside className={showSidebar ? "chats-sidebar card mobile-screen-active" : "chats-sidebar card mobile-screen-hidden"}>
              <div className="chats-sidebar-header">
                <div>
                  <h2>{sidebarMode === "archived" ? "Архив" : "Диалоги"}</h2>
                </div>
                <span>{filteredChats.length}</span>
              </div>
              <div className="chat-sidebar-tabs">
                <button type="button" className={sidebarMode === "active" ? "chat-sidebar-tab active" : "chat-sidebar-tab"} onClick={() => setSidebarMode("active")}>Диалоги</button>
                <button type="button" className={sidebarMode === "archived" ? "chat-sidebar-tab active" : "chat-sidebar-tab"} onClick={() => setSidebarMode("archived")}>Архив</button>
              </div>
              <div className="chats-sidebar-list">
                {filteredChats.length ? filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className={chat.id === selectedChatId ? "chat-room-link active" : "chat-room-link"}
                    onClick={() => selectChat(chat.id)}
                    onContextMenu={(event) => handleChatContextMenu(event, chat)}
                  >
                    <span className="chat-room-avatar">{chat.initials || (chat.otherCompanyName || "Чат").slice(0, 2)}</span>
                    <span className="chat-room-copy">
                      <strong>{chat.otherCompanyName}</strong>
                      <span className="chat-room-preview">{getLastMessagePreview(chat)}</span>
                    </span>
                    <span className="chat-room-meta">
                      <span className="chat-room-time">{chat.lastActivityAt}</span>
                      {chat.unreadCount ? <span className="chat-unread-badge">{chat.unreadCount}</span> : null}
                    </span>
                  </button>
                )) : <div className="empty-chat-state">{sidebarMode === "archived" ? "В архиве пока нет чатов." : "Пока нет активных чатов."}</div>}
              </div>
              {contextMenu ? (
                <div className="chat-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
                  {deleteTargetId === contextMenu.chatId ? (
                    <>
                      <div className="chat-context-confirm">Удалить чат вместе с перепиской?</div>
                      <div className="chat-context-row">
                        <button
                          type="button"
                          className="chat-context-action chat-context-action-danger"
                          onClick={() => deleteChat(contextMenu.chatId)}
                        >
                          Удалить
                        </button>
                        <button
                          type="button"
                          className="chat-context-action"
                          onClick={() => setDeleteTargetId(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="chat-context-action"
                        onClick={() => {
                          const targetChat = chats.find((chat) => chat.id === contextMenu.chatId);
                          if (targetChat) {
                            toggleArchive(targetChat, !contextMenu.isArchived);
                          }
                        }}
                      >
                        {contextMenu.isArchived ? "Убрать из архива" : "Добавить в архив"}
                      </button>
                      <button
                        type="button"
                        className="chat-context-action chat-context-action-danger"
                        onClick={() => setDeleteTargetId(contextMenu.chatId)}
                      >
                        Удалить чат
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </aside>

            <section className={showChat ? "chat-center card mobile-screen-active" : "chat-center card mobile-screen-hidden"}>
              {selectedChat ? (
                <>
                  <div className="chat-window-header">
                    <div className="chat-window-header-main">
                      {isMobileLayout ? (
                        <button type="button" className="chat-mobile-nav-button" onClick={clearSelection} aria-label="Вернуться к диалогам">
                          <ArrowLeftIcon />
                        </button>
                      ) : null}
                      <Link to={selectedChat.otherCompanyId ? `/company/${selectedChat.otherCompanyId}` : "#"} className="chat-window-title chat-window-title-link">
                        <span className="chat-room-avatar large">{selectedChat.initials || selectedChat.otherCompanyName.slice(0, 2)}</span>
                        <div>
                          <strong>{selectedChat.otherCompanyName}</strong>
                          <span>{selectedChat.contractTitle}</span>
                        </div>
                      </Link>
                    </div>
                    {isMobileLayout ? (
                      <button type="button" className="chat-mobile-nav-button" onClick={() => setMobileView("details")} aria-label="Открыть условия">
                        <DetailsIcon />
                      </button>
                    ) : statusControl}
                  </div>
{selectedChat.orderId ? (
                    <div className="chat-order-strip">
                      <Link to={`/listing/${selectedChat.orderId}`} className="chat-order-link">Перейти в объявление</Link>
                    </div>
                  ) : null}
                  <div className="chat-window-messages">
                    {selectedChat.messages.map((message, index) => (
                      <div key={message.id} className="chat-message-group">
                        {firstUnreadIndex === index ? <div className="chat-unread-divider">Непрочитанные сообщения</div> : null}
                        <article className={message.senderCompanyId === user.companyId ? "chat-bubble own" : "chat-bubble"}>
                          {message.text ? <p>{message.text}</p> : null}
                          {message.attachments?.length ? (
                            <div className="chat-attachments">
                              {message.attachments.map((attachment) => (
                                <a key={`${message.id}-${attachment.name}`} href={attachment.dataUrl} download={attachment.name} className="chat-attachment-link">
                                  {attachment.name}
                                </a>
                              ))}
                            </div>
                          ) : null}
                          <span className="chat-message-time">{message.createdAt}</span>
                        </article>
                      </div>
                    ))}
                  </div>
                  {incomingStatusRequest ? (
                    <div className="chat-status-request-banner">
                      <p>{selectedChat.otherCompanyName} хочет сменить статус на {CHAT_STATUS_LABELS[selectedChat.pendingStatus]}.</p>
                      <div className="chat-status-request-actions">
                        <button type="button" className="button button-primary" onClick={() => respondToStatusRequest(true)} disabled={statusBusy}>Принять</button>
                        <button type="button" className="button button-secondary" onClick={() => respondToStatusRequest(false)} disabled={statusBusy}>Отклонить</button>
                      </div>
                    </div>
                  ) : outgoingStatusRequest ? (
                    <div className="chat-status-request-banner pending">
                      <p>Запрос на статус {CHAT_STATUS_LABELS[selectedChat.pendingStatus]} отправлен. Ждём подтверждения второй стороны.</p>
                    </div>
                  ) : null}
                  <div className="chat-compose-panel">
                    {pendingFiles.length ? (
                      <div className="pending-files-row">
                        {pendingFiles.map((file, index) => (
                          <button key={`${file.name}-${index}`} type="button" className="pending-file-chip" onClick={() => removePendingFile(index)}>
                            {file.name} ×
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="chat-compose-row">
                      <button type="button" className="attach-button" onClick={() => fileInputRef.current?.click()} title="Прикрепить файл">
                        <FileIcon />
                      </button>
                      <input name="chatAttachments" ref={fileInputRef} type="file" accept=".pdf,.jpeg,.jpg,.png" multiple hidden onChange={handlePickFiles} />
                      <textarea name="chatMessage" ref={messageInputRef} rows="1" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Напишите сообщение" />
                      <button type="button" className="send-button" onClick={sendMessage} title="Отправить сообщение" aria-label="Отправить сообщение">
                        <SendIcon />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="chat-panel-empty">
                  <h2>Выберите чат</h2>
                  <p>{sidebarMode === "archived" ? "Откройте архивный диалог слева, чтобы просмотреть переписку." : "Список слева открыт, но ни один диалог пока не выбран."}</p>
                </div>
              )}
            </section>

            <aside className={showDetails ? "chat-details-panel card mobile-screen-active" : "chat-details-panel card mobile-screen-hidden"}>
              {selectedChat ? (
                <>
                  {isMobileLayout ? (
                    <div className="chat-details-mobile-header">
                      <button type="button" className="chat-mobile-nav-button" onClick={() => setMobileView("chat")} aria-label="Вернуться в чат">
                        <ArrowLeftIcon />
                      </button>
                      <h2>Условия</h2>
                      {statusControl}
                    </div>
                  ) : null}<div className="chat-details-block">
                    <h3>Что запросили</h3>
                    <div className="chat-details-preview">{formatRequested(selectedChat)}</div>
                  </div>
                  <div className="chat-details-block">
                    <h3>Что предложили</h3>
                    <div className="chat-details-preview">{offeredDraft || "Предложение пока не сформировано."}</div>
                    <button type="button" className="button button-secondary button-block" onClick={() => setOfferModalOpen(true)}>Предложить условия</button>
                  </div>
                  <div className="chat-details-block">
                    <h3>На чём сошлись</h3>
                    <textarea name="chatAgreementDetails" rows="7" value={agreementDraft} onChange={(event) => setAgreementDraft(event.target.value)} placeholder="Запишите согласованные условия, дедлайны, объёмы и следующий шаг." />
                  </div>
                  {detailsStatus ? <div className="success-banner">{detailsStatus}</div> : null}
                  <button type="button" className="button button-primary button-block" onClick={saveDetails}>Сохранить детали</button>
                </>
              ) : (
                <div className="chat-panel-empty">
                  <h2>Детали чата</h2>
                  <p>Правый блок станет активным после выбора диалога.</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>
      {selectedChat && offerModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOfferModalOpen(false)}>
          <div className="modal-card card" role="dialog" aria-modal="true" aria-labelledby="offer-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 id="offer-modal-title">Предложить условия</h2>
                <p>{selectedChat.otherCompanyName}</p>
              </div>
              <button type="button" className="button button-secondary" onClick={() => setOfferModalOpen(false)}>Закрыть</button>
            </div>
            <div className="field">
              <span>Цена</span>
              <input name="offerPrice" value={offerForm.price} onChange={(event) => setOfferForm((current) => ({ ...current, price: event.target.value }))} placeholder="Например: от 180 000 ₽" />
            </div>
            <div className="field">
              <span>Сроки</span>
              <input name="offerTimeline" value={offerForm.timeline} onChange={(event) => setOfferForm((current) => ({ ...current, timeline: event.target.value }))} placeholder="Например: 14 рабочих дней" />
            </div>
            <div className="field">
              <span>Комментарий</span>
              <textarea name="offerComment" rows="5" value={offerForm.comment} onChange={(event) => setOfferForm((current) => ({ ...current, comment: event.target.value }))} placeholder="Уточните объём, этапы, ограничения или состав поставки." />
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setOfferModalOpen(false)}>Отмена</button>
              <button type="button" className="button button-primary" onClick={submitOffer}>Подготовить предложение</button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

export default ChatsPage;





