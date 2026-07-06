// Core LMS (Lambda-Mu-Sigma) statistics. Pure, framework-agnostic math.
//
// The LMS method (Cole & Green) models a skewed distribution at each age with
// three smoothly-varying parameters:
//   L = Box-Cox power, M = median, S = coefficient of variation.
// Given a measurement X:
//   Z = ((X/M)^L - 1) / (L*S)      (L != 0)
//   Z = ln(X/M) / S                (L == 0)
// and the inverse (used to draw centile curves):
//   X = M * (1 + L*S*Z)^(1/L)      (L != 0)
//   X = M * exp(S*Z)               (L == 0)

const L_EPS = 1e-7;

export function zFromMeasurement(x: number, L: number, M: number, S: number): number {
  if (Math.abs(L) < L_EPS) return Math.log(x / M) / S;
  return (Math.pow(x / M, L) - 1) / (L * S);
}

export function measurementFromZ(z: number, L: number, M: number, S: number): number {
  if (Math.abs(L) < L_EPS) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/** Standard normal CDF via a rational approximation of erfc (|err| < 1.2e-7). */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

function erfc(x: number): number {
  // Numerical Recipes "erfcc": fractional error everywhere < 1.2e-7.
  const t = 1 / (1 + 0.5 * Math.abs(x));
  const tau =
    t *
    Math.exp(
      -x * x -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? tau : 2 - tau;
}

/** Inverse standard normal CDF (Acklam's algorithm, |err| < 1.15e-9). */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  let r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

export function centileFromZ(z: number): number {
  return normalCdf(z) * 100;
}

export function zFromCentile(centile: number): number {
  return normalInv(centile / 100);
}
