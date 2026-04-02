import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

const ACCEPTED_FILES = ["application/pdf", "image/jpeg", "image/png"];

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
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [offerForm, setOfferForm] = useState({ price: "", timeline: "", comment: "" });
  const [contextMenu, setContextMenu] = useState(null);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);

  const loadChats = useCallback(async () => {
    try {
      const chatData = await apiFetch("/chats");
      setChats(chatData);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
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
    const chatCompany = searchParams.get("chatCompany");
    const orderId = searchParams.get("orderId");
    if (!user?.companyId || !chatCompany) return;

    apiFetch("/chats/open", {
      method: "POST",
      body: JSON.stringify({
        companyId: chatCompany,
        orderId,
        subject: orderId ? `Отклик по объявлению ${orderId}` : "Обсуждение сотрудничества",
        message: orderId ? `Здравствуйте. Интересует ваше объявление ${orderId}.` : "",
      }),
    })
      .then(async (data) => {
        setSidebarMode("active");
        setSelectedChatId(data.chatId);
        setSearchParams(data.chatId ? { chatId: data.chatId } : {});
        await loadChats();
      })
      .catch((openError) => setError(openError.message));
  }, [searchParams, user, loadChats, setSearchParams]);

  const filteredChats = useMemo(
    () => chats.filter((chat) => (sidebarMode === "archived" ? chat.isArchived : !chat.isArchived)),
    [chats, sidebarMode],
  );

  const selectedChat = chats.find((chat) => chat.id === selectedChatId) || null;

  useEffect(() => {
    setMessageDraft("");
    setPendingFiles([]);
    setDetailsStatus("");
    setAgreementDraft(selectedChat?.agreementDetails || "");
    setOfferModalOpen(false);
    setOfferForm({ price: "", timeline: "", comment: "" });
    setContextMenu(null);
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;
    const existsInCurrentList = filteredChats.some((chat) => chat.id === selectedChatId);
    if (!existsInCurrentList) {
      setSelectedChatId(null);
      setSearchParams({});
    }
  }, [filteredChats, selectedChatId, setSearchParams]);

  useEffect(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(48, Math.min(textarea.scrollHeight, 220))}px`;
  }, [messageDraft, selectedChatId]);

  const selectChat = (chatId) => {
    setContextMenu(null);
    setSelectedChatId(chatId);
    setSearchParams({ chatId });
  };

  const clearSelection = () => {
    setContextMenu(null);
    setSelectedChatId(null);
    setSearchParams({});
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
    setContextMenu({ chatId: chat.id, x: event.clientX, y: event.clientY, isArchived: chat.isArchived });
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

  const sendMessage = async () => {
    if (!selectedChat) return;
    if (!messageDraft.trim() && pendingFiles.length === 0) return;

    try {
      await apiFetch(`/chats/${selectedChat.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: messageDraft.trim(), attachments: pendingFiles }),
      });
      setMessageDraft("");
      setPendingFiles([]);
      await loadChats();
    } catch (messageError) {
      setError(messageError.message);
    }
  };

  const saveAgreement = async () => {
    if (!selectedChat) return;

    try {
      await apiFetch(`/chats/${selectedChat.id}/details`, {
        method: "PUT",
        body: JSON.stringify({ offeredDetails: selectedChat.offeredDetails || "", agreementDetails: agreementDraft }),
      });
      setDetailsStatus("Договорённости сохранены.");
      await loadChats();
    } catch (saveError) {
      setError(saveError.message);
      setDetailsStatus("");
    }
  };

  const submitOffer = async () => {
    if (!selectedChat) return;

    const offeredDetails = formatOfferDetails(offerForm);
    if (!offeredDetails) {
      setError("Заполните хотя бы одно поле предложения.");
      return;
    }

    try {
      await apiFetch(`/chats/${selectedChat.id}/details`, {
        method: "PUT",
        body: JSON.stringify({ offeredDetails, agreementDetails: agreementDraft }),
      });
      setDetailsStatus("Предложение обновлено.");
      setOfferModalOpen(false);
      setOfferForm({ price: "", timeline: "", comment: "" });
      await loadChats();
    } catch (saveError) {
      setError(saveError.message);
      setDetailsStatus("");
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <Layout>
      <section className="chats-page-section">
        <div className="container">
          <div className="chats-page-header card">
            <div>
              <h1>Чаты</h1>
            </div>
            {selectedChat ? <button type="button" className="button button-secondary" onClick={clearSelection}>Снять выбор</button> : null}
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          <div className="chats-workspace">
            <aside className="chats-sidebar card">
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
                      <span>{chat.contractTitle}</span>
                    </span>
                  </button>
                )) : <div className="empty-chat-state">{sidebarMode === "archived" ? "В архиве пока нет чатов." : "Пока нет активных чатов."}</div>}
              </div>
              {contextMenu ? (
                <div className="chat-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
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
                </div>
              ) : null}
            </aside>

            <section className="chat-center card">
              {selectedChat ? (
                <>
                  <div className="chat-window-header">
                    <div className="chat-window-title">
                      <span className="chat-room-avatar large">{selectedChat.initials || selectedChat.otherCompanyName.slice(0, 2)}</span>
                      <div>
                        <strong>{selectedChat.otherCompanyName}</strong>
                        <span>{selectedChat.contractTitle}</span>
                      </div>
                    </div>
                  </div>
                  <div className="chat-window-messages">
                    {selectedChat.messages.map((message) => (
                      <article key={message.id} className={message.senderCompanyId === user.companyId ? "chat-bubble own" : "chat-bubble"}>
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
                    ))}
                  </div>
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
                      <input ref={fileInputRef} type="file" accept=".pdf,.jpeg,.jpg,.png" multiple hidden onChange={handlePickFiles} />
                      <textarea ref={messageInputRef} rows="1" value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Напишите сообщение" />
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

            <aside className="chat-details-panel card">
              {selectedChat ? (
                <>
                  <div className="chat-details-block">
                    <h3>Что запросили</h3>
                    <div className="chat-details-preview">{formatRequested(selectedChat)}</div>
                  </div>
                  <div className="chat-details-block">
                    <h3>Что предложили</h3>
                    <div className="chat-details-preview">{selectedChat.offeredDetails || "Предложение пока не сформировано."}</div>
                    <button type="button" className="button button-secondary button-block" onClick={() => setOfferModalOpen(true)}>Предложить условия</button>
                  </div>
                  <div className="chat-details-block">
                    <h3>На чём сошлись</h3>
                    <textarea rows="7" value={agreementDraft} onChange={(event) => setAgreementDraft(event.target.value)} placeholder="Запишите согласованные условия, дедлайны, объёмы и следующий шаг." />
                  </div>
                  {detailsStatus ? <div className="success-banner">{detailsStatus}</div> : null}
                  <button type="button" className="button button-primary button-block" onClick={saveAgreement}>Сохранить договорённости</button>
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
              <input value={offerForm.price} onChange={(event) => setOfferForm((current) => ({ ...current, price: event.target.value }))} placeholder="Например: от 180 000 ₽" />
            </div>
            <div className="field">
              <span>Сроки</span>
              <input value={offerForm.timeline} onChange={(event) => setOfferForm((current) => ({ ...current, timeline: event.target.value }))} placeholder="Например: 14 рабочих дней" />
            </div>
            <div className="field">
              <span>Комментарий</span>
              <textarea rows="5" value={offerForm.comment} onChange={(event) => setOfferForm((current) => ({ ...current, comment: event.target.value }))} placeholder="Уточните объём, этапы, ограничения или состав поставки." />
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setOfferModalOpen(false)}>Отмена</button>
              <button type="button" className="button button-primary" onClick={submitOffer}>Сохранить предложение</button>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

export default ChatsPage;
