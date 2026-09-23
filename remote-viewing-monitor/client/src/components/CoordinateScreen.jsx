export default function CoordinateScreen({ coordinate, onBegin }) {
  return (
    <div className="center-screen">
      <p>Coordinate designation</p>
      <div className="coordinate-display">{coordinate}</div>
      <button className="btn btn-primary btn-block" onClick={onBegin}>Begin Session</button>
    </div>
  );
}
