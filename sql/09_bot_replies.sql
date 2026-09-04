-- ============================================================================
-- РАСТИМ · платформа найма
-- Миграция 09. ОТВЕТЫ БОТА НЕ СЧИТАЮТСЯ ДОЖИМОМ.
--
-- Лимит касаний (фишка 41) существует, чтобы мы не долбили человека, который
-- нас не звал. Ответ на прямой вопрос кандидата — не касание: инициатива
-- его, а молчать в ответ хуже, чем ответить.
--
-- Без этой правки бот, отвечающий «ваш статус — интервью», сжигал бы недельный
-- лимит за три вопроса, и живой рекрутер потом не смог бы написать.
-- ============================================================================

begin;

create or replace function public.on_message_inserted()
returns trigger language plpgsql security definer set search_path = public
as $fn$
begin
  update public.conversations
  set last_message_at = new.sent_at,
      unread_for_staff = case
        when new.direction = 'inbound' then unread_for_staff + 1
        else 0 end
  where id = new.conversation_id;

  -- Касанием считается то, что мы начали сами. Автоответ бота на вопрос
  -- кандидата инициативой не является и в счётчик не идёт.
  if new.direction = 'outbound' and coalesce(new.ai_intent, '') <> 'auto_reply' then
    insert into public.candidate_touches (candidate_id, channel, kind, application_id)
    select c.candidate_id, c.channel, coalesce(new.ai_intent, 'message'), c.application_id
    from public.conversations c where c.id = new.conversation_id;
  end if;

  update public.candidates c
  set last_activity_at = new.sent_at
  where c.id = (select candidate_id from public.conversations where id = new.conversation_id);

  return new;
end;
$fn$;

comment on function public.on_message_inserted is
  'Счётчик непрочитанного и касания. Автоответы бота (ai_intent = auto_reply) в лимит не идут: отвечать на вопрос — не дожим.';

-- ---------------------------------------------------------------------------
-- Кандидат может подтвердить согласие кнопкой в боте — значит, для него
-- нужна запись без участия сотрудника. Служебный ключ пишет её сам,
-- политики здесь не мешают: функции ходят мимо RLS.
--
-- А вот повторно выдавать согласие на то же самое не нужно: одна активная
-- запись на вид согласия.
-- ---------------------------------------------------------------------------
create unique index if not exists idx_consents_active
  on public.consents (candidate_id, kind)
  where revoked_at is null and candidate_id is not null;

commit;
