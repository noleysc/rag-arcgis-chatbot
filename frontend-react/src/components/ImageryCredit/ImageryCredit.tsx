import { useLayerData } from "../../hooks/useLayerData";
import { ESRI_URL, IMAGERY_CREDIT_FALLBACK, fetchImageryCredit } from "../../lib/imagery";

/** Esri's required attribution for World Imagery: "Powered by Esri" plus
 * the service's own data credit. Sits next to wherever the imagery shows. */
export default function ImageryCredit() {
  const credit = useLayerData(fetchImageryCredit) || IMAGERY_CREDIT_FALLBACK;
  return (
    <p className="imagery-credit">
      Aerial imagery powered by{" "}
      <a href={ESRI_URL} target="_blank" rel="noopener noreferrer">
        Esri
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      . {credit}
    </p>
  );
}
