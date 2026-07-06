export default function FullPageSpinner({ tip = 'Loading...' }) {
  return (
    <div className="full-page-loader">
      <div className="full-page-loader__ring" aria-hidden />
      <span className="full-page-loader__text">{tip}</span>
    </div>
  )
}
