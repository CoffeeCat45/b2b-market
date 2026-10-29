export function RequiredMark() {
  return (
    <span className="required-mark" aria-hidden="true">
      {" *"}
    </span>
  );
}

export function RequiredFieldsNote() {
  return <p className="required-fields-note">Поля со звёздочкой обязательны</p>;
}
