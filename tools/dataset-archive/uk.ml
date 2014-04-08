open Core.Std

(* NB: float32 not 64! *)
type dsuk_arr = (float, Bigarray.float32_elt, Bigarray.c_layout) Bigarray.Genarray.t

type t = Time.t * dsuk_arr

(* XXX this needs the system clock to be UTC *)
(* XXX location hardcoded *)
let filename dstime = Time.format dstime "%Y%m%d%H-UK"
let shape = (65, 47, 3, 21, 30)
let topleft = (0, 0, 0, 279, 696)

let shape_arr = let a, b, c, d, e = shape in [|a;b;c;d;e|]
let topleft_arr = let a, b, c, d, e = topleft in [|a;b;c;d;e|]

let create dstime =
    let module BA = Bigarray in
    let arr = Unix.with_file (filename dstime) ~mode:[O_RDWR; O_CREAT] ~f:(fun fd ->
        BA.Genarray.map_file fd BA.float32 BA.c_layout true shape_arr
    ) in
    (dstime, arr)

let get (_, arruk) = Bigarray.Genarray.get arruk
let set (_, arruk) = Bigarray.Genarray.set arruk
let dstime = fst

let iter_pair f =
    let sa, sb, sc, sd, se = shape in
    let _, _, _, _, se' = Dataset.shape in
    let ta, tb, tc, td, te = topleft in
    for i = 0 to sa - 1 do
        let i' = i + ta in
        for j = 0 to sb - 1 do
            let j' = j + tb in
            for k = 0 to sc - 1 do
                let k' = k + tc in
                for l = 0 to sd - 1 do
                    let l' = l + td in
                    for m = 0 to se - 1 do
                        let m' = (m + te) mod se' in
                        f [|i;j;k;l;m|] [|i';j';k';l';m'|] 
                    done
                done
            done
        done
    done

let copy_from_dataset dsuk ds =
    iter_pair (fun dsuk_idxs ds_idxs -> set dsuk dsuk_idxs (Dataset.get ds ds_idxs))

let copy_to_dataset dsuk ds =
    iter_pair (fun dsuk_idxs ds_idxs -> Dataset.set ds ds_idxs (get dsuk dsuk_idxs))
